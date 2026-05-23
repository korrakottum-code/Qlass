"""
HN Sync — Auto login to Pro Clinic, fetch all customers, upsert to Supabase.
Usage: python sync.py
"""

import asyncio
import aiohttp
import aiohttp.cookiejar
import json
import os
import sys
import yarl
from datetime import datetime, timezone
from dotenv import load_dotenv
import httpx
# playwright is imported lazily only when needed (not installed on CI)

load_dotenv()

# === Config ===
PROCLINIC_EMAIL    = os.getenv("PROCLINIC_EMAIL")
PROCLINIC_PASSWORD = os.getenv("PROCLINIC_PASSWORD")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_KEY")

LOGIN_URL   = "https://proclinicth.com/login"
API_URL     = "https://proclinicth.com/admin/api/customer"
CONCURRENCY = 10
BATCH_SIZE  = 50
DELAY       = 0.5
COOKIE_FILE    = os.path.join(os.path.dirname(__file__), "cookies.json")
STATE_FILE     = os.path.join(os.path.dirname(__file__), "sync_state.json")
PROGRESS_FILE  = os.path.join(os.path.dirname(__file__), "sync_progress.json")


async def auto_login() -> dict:
    """Try saved cookies first; if expired, do headed Playwright login."""
    print("[1/3] Authenticating...")

    # Try saved cookies
    if os.path.exists(COOKIE_FILE):
        print("  Trying saved cookies...")
        with open(COOKIE_FILE, "r") as f:
            saved = json.load(f)
        cookie_dict = {c["name"]: c["value"] for c in saved if "proclinicth" in c.get("domain", "")}
        # Quick validation — ส่ง header เหมือน browser จริงเพื่อไม่ให้ server block
        browser_headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Accept-Language": "th,en;q=0.9",
            "Referer": "https://proclinicth.com/admin/customer",
            "X-Requested-With": "XMLHttpRequest",
        }
        jar = aiohttp.CookieJar()
        async with aiohttp.ClientSession(cookie_jar=jar, headers=browser_headers) as session:
            for name, value in cookie_dict.items():
                jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
            try:
                async with session.get(API_URL, params={"page": 1}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    text = await r.text()
                    print(f"  Cookie test: HTTP {r.status}, response starts with: {text[:80]!r}")
                    if text.strip().startswith("{") and '"data"' in text:
                        print("  [OK] Saved cookies still valid")
                        return cookie_dict
            except Exception as e:
                print(f"  Cookie test error: {e}")
        print("  Saved cookies expired, re-login needed...")

    # Headed login (reCAPTCHA requires visible browser — only works locally)
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        raise RuntimeError(
            "Cookies expired and Playwright not installed. "
            "Run 'python sync.py' locally to refresh cookies, then update PROCLINIC_COOKIES secret."
        )

    print("  Opening browser for login...")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        await page.goto(LOGIN_URL, wait_until="networkidle")
        await page.fill('input[name="email"]', PROCLINIC_EMAIL)
        await page.fill('input[name="password"]', PROCLINIC_PASSWORD)

        print("  ✋ กรุณา tick reCAPTCHA แล้วกด Login")
        print("  ⚠️  อย่าปิด browser — รอให้ script ปิดให้เองอัตโนมัติ")
        print("  รอสูงสุด 3 นาที...")

        # Polling ทุก 1 วินาที รอจนกว่า URL ไม่ใช่ login page
        import time as _time
        deadline = _time.time() + 180  # 3 นาที
        while _time.time() < deadline:
            await asyncio.sleep(1)
            try:
                current_url = page.url
                print(f"  URL: {current_url}", flush=True)
                if "login" not in current_url:
                    print("  [OK] Login สำเร็จ!")
                    break
            except Exception:
                # browser ถูกปิด
                raise RuntimeError("Browser ถูกปิดก่อน login เสร็จ — อย่าปิด browser เอง")
        else:
            await browser.close()
            raise RuntimeError("Login timeout 3 นาที")

        cookies = await page.context.cookies()
        await browser.close()

    # Save cookies for next run
    with open(COOKIE_FILE, "w") as f:
        json.dump(cookies, f)
    cookie_dict = {c["name"]: c["value"] for c in cookies if "proclinicth" in c.get("domain", "")}
    print(f"  [OK] Login successful, saved cookies for next time")
    return cookie_dict


async def fetch_page(session: aiohttp.ClientSession, sem: asyncio.Semaphore, page: int) -> list:
    """Fetch a single page of customers with retry."""
    async with sem:
        await asyncio.sleep(0.1)
        for attempt in range(5):
            try:
                async with session.get(
                    API_URL,
                    params={"page": page},
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as r:
                    text = await r.text()
                    if not text.strip().startswith("{"):
                        raise ValueError(f"non-JSON response on page {page}")
                    data = json.loads(text)
                    return [
                        {
                            "hn_id": str(c.get("hn_id", "")),
                            "firstname": c.get("firstname", "") or "",
                            "lastname": c.get("lastname", "") or "",
                            "nickname": c.get("nickname", "") or "",
                            "telephone": c.get("telephone_number", "") or "",
                            "birthdate": c.get("birthdate", "") or "",
                        }
                        for c in data.get("data", [])
                    ]
            except Exception as e:
                if attempt == 4:
                    print(f"  [SKIP] page {page}: {e}")
                    return []
                await asyncio.sleep(2 ** attempt)
    return []


async def fetch_all_customers(session: aiohttp.ClientSession) -> list:
    """Fetch all customers from Pro Clinic API."""
    print("[2/3] Fetching customers from Pro Clinic...")

    # Get first page to learn total
    async with session.get(API_URL, params={"page": 1}) as resp:
        first = await resp.json(content_type=None)

    total_pages = first["last_page"]
    total = first["total"]
    print(f"  Found {total:,} records across {total_pages:,} pages")

    # Collect page 1 data
    all_customers = [
        {
            "hn_id": str(c.get("hn_id", "")),
            "firstname": c.get("firstname", "") or "",
            "lastname": c.get("lastname", "") or "",
            "nickname": c.get("nickname", "") or "",
            "telephone": c.get("telephone_number", "") or "",
            "birthdate": c.get("birthdate", "") or "",
        }
        for c in first.get("data", [])
    ]

    # Fetch remaining pages in batches
    sem = asyncio.Semaphore(CONCURRENCY)
    for start in range(2, total_pages + 1, BATCH_SIZE):
        end = min(start + BATCH_SIZE - 1, total_pages)
        tasks = [fetch_page(session, sem, p) for p in range(start, end + 1)]
        results = await asyncio.gather(*tasks)
        for rows in results:
            all_customers.extend(rows)
        print(f"  {len(all_customers):,} / {total:,} ({len(all_customers)/total*100:.1f}%)")
        await asyncio.sleep(DELAY)

    print(f"  [OK] Fetched {len(all_customers):,} customers")
    return all_customers


def load_state() -> dict:
    """Load last sync state (total records known)."""
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"last_total": 0}


def save_state(total: int):
    """Save current sync state."""
    with open(STATE_FILE, "w") as f:
        json.dump({"last_total": total, "last_sync": datetime.now(timezone.utc).isoformat()}, f)


async def fetch_new_customers(session: aiohttp.ClientSession) -> list:
    """Fetch only NEW customers since last sync (incremental)."""
    print("[2/3] Checking for new customers...")

    # Get current total
    async with session.get(API_URL, params={"page": 1}) as resp:
        first = await resp.json(content_type=None)

    total = first["total"]
    total_pages = first["last_page"]
    per_page = len(first.get("data", []))

    state = load_state()
    last_total = state.get("last_total", 0)
    new_count = total - last_total

    if new_count <= 0:
        print(f"  No new records (total: {total:,}, last sync: {last_total:,})")
        return []

    # Calculate which pages contain new records
    # Pro Clinic API is ordered oldest-first, so new records are at the END
    pages_with_new = (new_count // per_page) + 2  # +2 for safety margin
    start_page = max(1, total_pages - pages_with_new)
    print(f"  {new_count:,} new records found (total: {total:,}, was: {last_total:,})")
    print(f"  Fetching pages {start_page:,} to {total_pages:,}...")

    # Fetch only the pages with new records
    all_customers = []
    sem = asyncio.Semaphore(CONCURRENCY)
    for start in range(start_page, total_pages + 1, BATCH_SIZE):
        end = min(start + BATCH_SIZE - 1, total_pages)
        tasks = [fetch_page(session, sem, p) for p in range(start, end + 1)]
        results = await asyncio.gather(*tasks)
        for rows in results:
            all_customers.extend(rows)
        print(f"  {len(all_customers):,} fetched")
        await asyncio.sleep(DELAY)

    print(f"  Fetched {len(all_customers):,} records (includes overlap for safety)")
    # Save new state
    save_state(total)
    return all_customers


async def fetch_from_page(session: aiohttp.ClientSession, start_page: int) -> list:
    """Fetch customers from a specific page and upsert in chunks along the way.
    Saves progress after each batch so it can resume if interrupted.
    """
    print(f"[2/3] Fetching from page {start_page}...")

    # Get total pages
    async with session.get(API_URL, params={"page": 1}, timeout=aiohttp.ClientTimeout(total=30)) as resp:
        first = await resp.json(content_type=None)
    total_pages = first["last_page"]
    total = first["total"]
    print(f"  Total: {total:,} records, {total_pages:,} pages. Fetching {start_page} → {total_pages}")

    buffer = []
    total_upserted = 0
    sem = asyncio.Semaphore(CONCURRENCY)
    for start in range(start_page, total_pages + 1, BATCH_SIZE):
        end = min(start + BATCH_SIZE - 1, total_pages)
        tasks = [fetch_page(session, sem, p) for p in range(start, end + 1)]
        results = await asyncio.gather(*tasks)
        for rows in results:
            buffer.extend(rows)
        pct = (total_upserted + len(buffer)) / total * 100
        print(f"  {total_upserted + len(buffer):,} / {total:,} ({pct:.1f}%) — page {end}/{total_pages}")
        await asyncio.sleep(DELAY)

        # บันทึก progress ทุก batch — ถ้า crash จะ resume จากหน้านี้
        with open(PROGRESS_FILE, "w") as f:
            json.dump({"last_page": end, "total_upserted": total_upserted + len(buffer)}, f)

        # Upsert every 2000 records to avoid memory + timeout issues
        if len(buffer) >= 2000:
            upsert_to_supabase(buffer)
            total_upserted += len(buffer)
            buffer = []

    # Upsert remaining
    if buffer:
        upsert_to_supabase(buffer)
        total_upserted += len(buffer)

    # ลบ progress file เมื่อเสร็จ + บันทึก state
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)
    save_state(total)
    print(f"  [OK] Total upserted {total_upserted:,} customers from page {start_page}")
    return []  # Already upserted along the way


def upsert_to_supabase(customers: list):
    """Upsert all customers to Supabase hn_customers table via REST API."""
    print("[3/3] Upserting to Supabase...")

    url = f"{SUPABASE_URL}/rest/v1/hn_customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    now = datetime.now(timezone.utc).isoformat()
    for c in customers:
        c["synced_at"] = now

    # Deduplicate by hn_id — เอา record ล่าสุดถ้า hn_id ซ้ำกันใน batch เดียวกัน
    seen = {}
    for c in customers:
        seen[c["hn_id"]] = c
    customers = list(seen.values())
    print(f"  (after dedup: {len(customers):,} unique records)")

    # Upsert in chunks of 500
    chunk_size = 500
    total = len(customers)
    errors = 0
    with httpx.Client(timeout=60) as client:
        for i in range(0, total, chunk_size):
            chunk = customers[i : i + chunk_size]
            resp = client.post(url, headers=headers, json=chunk)
            if resp.status_code not in (200, 201):
                print(f"  [ERROR] chunk {i//chunk_size}: {resp.status_code} {resp.text[:200]}")
                errors += 1
            else:
                print(f"  {min(i + chunk_size, total):,} / {total:,}")

    if errors:
        print(f"  [WARN] {errors} chunk(s) failed — ข้อมูลบางส่วนอาจไม่ได้ถูก upsert")
    print(f"  [OK] Upserted {total:,} records to hn_customers")


async def main():
    print(f"=== HN Sync - {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    # Validate env
    missing = []
    if not PROCLINIC_EMAIL:
        missing.append("PROCLINIC_EMAIL")
    if not PROCLINIC_PASSWORD:
        missing.append("PROCLINIC_PASSWORD")
    if not SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not SUPABASE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if missing:
        print(f"ERROR: Missing env vars: {', '.join(missing)}")
        print("Copy .env.example to .env and fill in the values.")
        return

    full_sync = "--full" in sys.argv
    resume_page = None
    for arg in sys.argv:
        if arg.startswith("--from="):
            resume_page = int(arg.split("=")[1])

    # Auto-resume: ถ้ามี progress file แสดงว่า sync หยุดกลางคัน
    if full_sync and not resume_page and os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            prog = json.load(f)
        resume_page = prog.get("last_page", 1)
        full_sync = False  # ใช้ resume mode แทน
        print(f"[MODE] Auto-resume จาก page {resume_page} (sync หยุดกลางคัน)\n")
    elif full_sync:
        print("[MODE] Full sync (--full flag detected)\n")
    if resume_page and not full_sync:
        print(f"[MODE] Resume from page {resume_page}\n")

    cookies = await auto_login()
    jar = aiohttp.CookieJar()
    browser_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "th,en;q=0.9",
        "Referer": "https://proclinicth.com/admin/customer",
        "X-Requested-With": "XMLHttpRequest",
    }
    async with aiohttp.ClientSession(cookie_jar=jar, headers=browser_headers) as session:
        # Set cookies
        for name, value in cookies.items():
            jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
        if resume_page:
            customers = await fetch_from_page(session, resume_page)
        elif full_sync:
            # ใช้ fetch_from_page (streaming) แทน fetch_all_customers (memory hog)
            customers = await fetch_from_page(session, 1)
        else:
            customers = await fetch_new_customers(session)

    if customers:
        upsert_to_supabase(customers)
        if full_sync:
            # Save state after full sync
            async with aiohttp.ClientSession(cookie_jar=jar) as session:
                for name, value in cookies.items():
                    jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
                async with session.get(API_URL, params={"page": 1}) as resp:
                    first = await resp.json(content_type=None)
                    save_state(first["total"])
    else:
        print("No new customers to sync.")

    print(f"\n=== Done! ===")


if __name__ == "__main__":
    asyncio.run(main())
