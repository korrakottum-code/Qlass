"""
Export all customers from Pro Clinic API to CSV.
Usage: python export_csv.py
"""
import asyncio
import aiohttp
import json
import csv
import os
import sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

COOKIE_FILE = os.path.join(os.path.dirname(__file__), "cookies.json")
API_URL = "https://proclinicth.com/admin/api/customer"
CONCURRENCY = 20
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                           f"hn_lookup_{datetime.now().strftime('%Y-%m-%d')}.csv")


async def fetch_page(session, sem, page):
    async with sem:
        await asyncio.sleep(0.05)
        for attempt in range(5):
            try:
                async with session.get(
                    API_URL,
                    params={"page": page},
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as r:
                    text = await r.text()
                    if not text.strip().startswith("{"):
                        raise ValueError(f"non-JSON page {page}")
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


async def main():
    print(f"=== Export Pro Clinic Customers to CSV ===\n")

    # Load cookies
    if not os.path.exists(COOKIE_FILE):
        print("ERROR: cookies.json not found. Run sync.py locally first.")
        return

    cookies = json.load(open(COOKIE_FILE))
    cookie_dict = {c["name"]: c["value"] for c in cookies if "proclinicth" in c.get("domain", "")}

    jar = aiohttp.CookieJar(unsafe=True)
    async with aiohttp.ClientSession(cookie_jar=jar) as session:
        for k, v in cookie_dict.items():
            session.cookie_jar.update_cookies({k: v})

        # Get total
        async with session.get(API_URL, params={"page": 1}) as resp:
            data = json.loads(await resp.text())
            total = data.get("total", 0)

        print(f"  Total records: {total:,}")
        total_pages = (total + 9) // 10
        print(f"  Total pages: {total_pages:,}")
        print(f"  Output: {OUTPUT_FILE}\n")

        # Fetch all pages
        all_customers = []
        first_page_data = [
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
        all_customers.extend(first_page_data)

        sem = asyncio.Semaphore(CONCURRENCY)
        batch = 100
        for start in range(2, total_pages + 1, batch):
            end = min(start + batch - 1, total_pages)
            tasks = [fetch_page(session, sem, p) for p in range(start, end + 1)]
            results = await asyncio.gather(*tasks)
            for rows in results:
                all_customers.extend(rows)
            print(f"  {len(all_customers):,} fetched ({len(all_customers)/total*100:.0f}%)")

    # Write CSV
    print(f"\nWriting CSV ({len(all_customers):,} records)...")
    with open(OUTPUT_FILE, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["hn_id", "firstname", "lastname", "nickname", "telephone", "birthdate"])
        writer.writeheader()
        writer.writerows(all_customers)

    print(f"[OK] Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
