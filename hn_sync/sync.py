"""
HN Sync — Auto login to Pro Clinic, fetch all customers, upsert to Supabase.
Usage: python sync.py
"""

import asyncio
import aiohttp
import aiohttp.cookiejar
import json
import os
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
CONCURRENCY = 20
BATCH_SIZE  = 100
DELAY       = 0.3
COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookies.json")
STATE_FILE  = os.path.join(os.path.dirname(__file__), "sync_state.json")


async def auto_login() -> dict:
    """Try saved cookies first; if expired, do headed Playwright login."""
    print("[1/3] Authenticating...")

    # Try saved cookies
    if os.path.exists(COOKIE_FILE):
        print("  Trying saved cookies...")
        with open(COOKIE_FILE, "r") as f:
            saved = json.load(f)
        cookie_dict = {c["name"]: c["value"] for c in saved if "proclinicth" in c.get("domain", "")}
        # Quick validation
        jar = aiohttp.CookieJar()
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            for name, value in cookie_dict.items():
                jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
            try:
                async with session.get(API_URL, params={"page": 1}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    text = await r.text()
                    if text.strip().startswith("{") and '"data"' in text:
                        print("  [OK] Saved cookies still valid")
                        return cookie_dict
            except Exception:
                pass
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

        await page.wait_for_timeout(3000)
        await page.evaluate("""() => {
            document.getElementById('form-submit').disabled = false;
            document.getElementById('form-submit').type = 'submit';
        }""")
        await page.click('#form-submit')
        await page.wait_for_timeout(5000)

        if "login" in page.url:
            await browser.close()
            raise RuntimeError(f"Login failed - still on: {page.url}")

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
                    timeout=aiohttp.ClientTimeout(total=30),
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
                    print(f"  ✗ skip page {page}: {e}")
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

    print(f"  ✓ Fetched {len(all_customers):,} customers")
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

    # Upsert in chunks of 500
    chunk_size = 500
    total = len(customers)
    with httpx.Client(timeout=60) as client:
        for i in range(0, total, chunk_size):
            chunk = customers[i : i + chunk_size]
            resp = client.post(url, headers=headers, json=chunk)
            if resp.status_code not in (200, 201):
                print(f"  ✗ Error at chunk {i}: {resp.status_code} {resp.text[:200]}")
            else:
                print(f"  {min(i + chunk_size, total):,} / {total:,}")

    print(f"  ✓ Upserted {total:,} records to hn_customers")


async def main():
    print(f"=== HN Sync — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

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

    cookies = await auto_login()
    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        # Set cookies from Playwright login
        for name, value in cookies.items():
            jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
        customers = await fetch_new_customers(session)

    if customers:
        upsert_to_supabase(customers)
    else:
        print("No new customers to sync.")

    print(f"\n=== Done! ===")


if __name__ == "__main__":
    asyncio.run(main())
