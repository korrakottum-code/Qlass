"""
Bulk Sync — ดึงทุก record จาก Pro Clinic แล้ว bulk upsert เข้า Supabase
ผ่าน PostgreSQL COPY (เร็วกว่า REST API ~10x)

Usage: python bulk_sync.py [--from=PAGE]
"""
import asyncio
import aiohttp
import json
import os
import sys
import io
import csv
import yarl
from datetime import datetime, timezone
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

PROCLINIC_EMAIL    = os.getenv("PROCLINIC_EMAIL")
PROCLINIC_PASSWORD = os.getenv("PROCLINIC_PASSWORD")
SUPABASE_DB_URL    = os.getenv("SUPABASE_DB_URL")   # postgresql://postgres:[password]@[host]:5432/postgres
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_KEY")

API_URL     = "https://proclinicth.com/admin/api/customer"
COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookies.json")
CONCURRENCY = 10
BATCH_SIZE  = 50
DELAY       = 0.5


async def auto_login() -> dict:
    print("[1/3] Authenticating...")
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE) as f:
            saved = json.load(f)
        cookie_dict = {c["name"]: c["value"] for c in saved if "proclinicth" in c.get("domain", "")}
        jar = aiohttp.CookieJar(unsafe=True)
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            for k, v in cookie_dict.items():
                jar.update_cookies({k: v}, response_url=yarl.URL("https://proclinicth.com"))
            try:
                async with session.get(API_URL, params={"page": 1}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    text = await r.text()
                    if text.strip().startswith("{") and '"data"' in text:
                        print("  [OK] Cookies valid")
                        return cookie_dict
            except Exception:
                pass
    raise RuntimeError("No valid cookies. Run sync.py first to login.")


async def fetch_page(session, sem, page):
    async with sem:
        await asyncio.sleep(0.1)
        for attempt in range(5):
            try:
                async with session.get(API_URL, params={"page": page}, timeout=aiohttp.ClientTimeout(total=60)) as r:
                    text = await r.text()
                    if not text.strip().startswith("{"):
                        raise ValueError(f"non-JSON page {page}")
                    data = json.loads(text)
                    return [
                        (
                            str(c.get("hn_id", "")),
                            c.get("firstname", "") or "",
                            c.get("lastname", "") or "",
                            c.get("nickname", "") or "",
                            c.get("telephone_number", "") or "",
                            c.get("birthdate", "") or "",
                        )
                        for c in data.get("data", [])
                    ]
            except Exception as e:
                if attempt == 4:
                    print(f"  [SKIP] page {page}: {e}")
                    return []
                await asyncio.sleep(2 ** attempt)
    return []


def bulk_upsert_postgres(rows: list):
    """Bulk upsert via PostgreSQL COPY + ON CONFLICT — fastest possible."""
    if not rows:
        return
    conn = psycopg2.connect(SUPABASE_DB_URL)
    cur = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Write to temp table then upsert
    cur.execute("""
        CREATE TEMP TABLE tmp_hn (
            hn_id TEXT, firstname TEXT, lastname TEXT,
            nickname TEXT, telephone TEXT, birthdate TEXT, synced_at TIMESTAMPTZ
        ) ON COMMIT DROP
    """)

    buf = io.StringIO()
    writer = csv.writer(buf)
    for r in rows:
        writer.writerow([r[0], r[1], r[2], r[3], r[4], r[5] or None, now])
    buf.seek(0)
    cur.copy_expert("COPY tmp_hn FROM STDIN WITH CSV", buf)

    cur.execute("""
        INSERT INTO hn_customers (hn_id, firstname, lastname, nickname, telephone, birthdate, synced_at)
        SELECT hn_id, firstname, lastname, nickname, telephone,
               NULLIF(birthdate, '')::date, synced_at
        FROM tmp_hn
        ON CONFLICT (hn_id) DO UPDATE SET
            firstname  = EXCLUDED.firstname,
            lastname   = EXCLUDED.lastname,
            nickname   = EXCLUDED.nickname,
            telephone  = EXCLUDED.telephone,
            birthdate  = EXCLUDED.birthdate,
            synced_at  = EXCLUDED.synced_at
    """)

    conn.commit()
    cur.close()
    conn.close()


def bulk_upsert_rest(rows: list):
    """Fallback: upsert via Supabase REST API."""
    import httpx
    url = f"{SUPABASE_URL}/rest/v1/hn_customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    now = datetime.now(timezone.utc).isoformat()
    customers = [
        {"hn_id": r[0], "firstname": r[1], "lastname": r[2],
         "nickname": r[3], "telephone": r[4], "birthdate": r[5] or None, "synced_at": now}
        for r in rows
    ]
    with httpx.Client(timeout=60) as client:
        for i in range(0, len(customers), 500):
            chunk = customers[i:i+500]
            resp = client.post(url, headers=headers, json=chunk)
            if resp.status_code not in (200, 201):
                print(f"  [ERROR] {resp.status_code}: {resp.text[:100]}")


async def main():
    print(f"=== Bulk Sync - {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")

    start_page = 1
    for arg in sys.argv[1:]:
        if arg.startswith("--from="):
            start_page = int(arg.split("=")[1])

    if start_page > 1:
        print(f"[MODE] Resume from page {start_page}\n")

    use_postgres = bool(SUPABASE_DB_URL)
    if use_postgres:
        print("[DB] Using PostgreSQL COPY (fast mode)")
    else:
        print("[DB] Using REST API (fallback mode)")

    cookies = await auto_login()
    jar = aiohttp.CookieJar(unsafe=True)

    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        for k, v in cookies.items():
            jar.update_cookies({k: v}, response_url=yarl.URL("https://proclinicth.com"))

        async with session.get(API_URL, params={"page": 1}) as r:
            first = json.loads(await r.text())
        total_pages = first["last_page"]
        total = first["total"]
        print(f"[2/3] Total: {total:,} records, {total_pages:,} pages. Start: {start_page}\n")

        buffer = []
        total_upserted = 0
        sem = asyncio.Semaphore(CONCURRENCY)

        for start in range(start_page, total_pages + 1, BATCH_SIZE):
            end = min(start + BATCH_SIZE - 1, total_pages)
            tasks = [fetch_page(session, sem, p) for p in range(start, end + 1)]
            results = await asyncio.gather(*tasks)
            for rows in results:
                buffer.extend(rows)
            pct = (end / total_pages) * 100
            print(f"  {total_upserted + len(buffer):,} fetched (page {end}/{total_pages} — {pct:.0f}%)")
            await asyncio.sleep(DELAY)

            if len(buffer) >= 2000:
                print(f"  [3/3] Upserting {len(buffer):,} records...")
                if use_postgres:
                    bulk_upsert_postgres(buffer)
                else:
                    bulk_upsert_rest(buffer)
                total_upserted += len(buffer)
                buffer = []
                print(f"  [OK] Total upserted so far: {total_upserted:,}")

        if buffer:
            print(f"  [3/3] Upserting final {len(buffer):,} records...")
            if use_postgres:
                bulk_upsert_postgres(buffer)
            else:
                bulk_upsert_rest(buffer)
            total_upserted += len(buffer)

    print(f"\n=== Done! Total upserted: {total_upserted:,} records ===")


if __name__ == "__main__":
    asyncio.run(main())
