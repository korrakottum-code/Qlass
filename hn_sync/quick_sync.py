"""
Quick Sync - ดึงแค่ลูกค้าหน้าท้าย ๆ (เร็ว)
ใช้เมื่อลูกค้าใหม่เพิ่มเข้ามาไม่นาน แต่ incremental sync ไม่จับ
"""

import asyncio
import aiohttp
import json
import os
import yarl
from datetime import datetime, timezone
from dotenv import load_dotenv
import httpx

load_dotenv()

PROCLINIC_EMAIL    = os.getenv("PROCLINIC_EMAIL")
PROCLINIC_PASSWORD = os.getenv("PROCLINIC_PASSWORD")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_KEY       = os.getenv("SUPABASE_SERVICE_KEY")

LOGIN_URL   = "https://proclinicth.com/login"
API_URL     = "https://proclinicth.com/admin/api/customer"
COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookies.json")

# จำนวนหน้าท้ายสุดที่จะดึง (ปรับได้)
LAST_PAGES = 5


async def auto_login():
    """Try saved cookies first; if expired, login with Playwright."""
    if os.path.exists(COOKIE_FILE):
        with open(COOKIE_FILE, "r") as f:
            saved = json.load(f)
        cookie_dict = {c["name"]: c["value"] for c in saved if "proclinicth" in c.get("domain", "")}
        jar = aiohttp.CookieJar()
        async with aiohttp.ClientSession(cookie_jar=jar) as session:
            for name, value in cookie_dict.items():
                jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
            try:
                async with session.get(API_URL, params={"page": 1}, timeout=aiohttp.ClientTimeout(total=15)) as r:
                    text = await r.text()
                    if text.strip().startswith("{") and '"data"' in text:
                        print("[OK] Cookies valid")
                        return cookie_dict
            except Exception:
                pass
        print("Cookies expired, need login...")
    
    raise RuntimeError("Please run 'python sync.py' first to login and save cookies")


async def fetch_recent_customers(session):
    """Fetch only LAST_PAGES from the end (newest customers)."""
    print(f"[Quick Sync] Fetching last {LAST_PAGES} pages...")
    
    # Get first page to know total
    async with session.get(API_URL, params={"page": 1}) as resp:
        first = await resp.json(content_type=None)
    
    total_pages = first["last_page"]
    start_page = max(1, total_pages - LAST_PAGES + 1)
    
    print(f"  Total pages: {total_pages}, fetching pages {start_page}-{total_pages}")
    
    all_customers = []
    for page in range(start_page, total_pages + 1):
        async with session.get(API_URL, params={"page": page}) as r:
            data = await r.json(content_type=None)
            for c in data.get("data", []):
                all_customers.append({
                    "hn_id": str(c.get("hn_id", "")),
                    "firstname": c.get("firstname", "") or "",
                    "lastname": c.get("lastname", "") or "",
                    "nickname": c.get("nickname", "") or "",
                    "telephone": c.get("telephone_number", "") or "",
                    "birthdate": c.get("birthdate", "") or "",
                })
        print(f"  Page {page}: +{len(data.get('data', []))} records")
    
    print(f"[OK] Fetched {len(all_customers)} recent customers")
    return all_customers


def upsert_to_supabase(customers):
    """Upsert to Supabase."""
    print("[Upserting to Supabase...]")
    
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
    
    chunk_size = 500
    total = len(customers)
    with httpx.Client(timeout=60) as client:
        for i in range(0, total, chunk_size):
            chunk = customers[i : i + chunk_size]
            resp = client.post(url, headers=headers, json=chunk)
            if resp.status_code not in (200, 201):
                print(f"  [ERROR] chunk {i}: {resp.status_code}")
            else:
                print(f"  {min(i + chunk_size, total):,} / {total:,}")
    
    print(f"[OK] Upserted {total:,} records")


async def main():
    print(f"=== Quick Sync - {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")
    
    cookies = await auto_login()
    jar = aiohttp.CookieJar()
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        for name, value in cookies.items():
            jar.update_cookies({name: value}, response_url=yarl.URL("https://proclinicth.com"))
        customers = await fetch_recent_customers(session)
    
    if customers:
        upsert_to_supabase(customers)
    else:
        print("No customers found")
    
    print(f"\n=== Done! ===")


if __name__ == "__main__":
    asyncio.run(main())
