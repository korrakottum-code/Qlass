"""
Import existing CSV file into Supabase hn_customers table.
Usage: python import_csv.py <path_to_csv>
"""
import sys
import csv
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
import httpx

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")


def import_csv(csv_path: str):
    print(f"=== Import CSV to Supabase ===")
    print(f"File: {csv_path}")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
        return

    # Read CSV
    records = []
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append({
                "hn_id": row.get("hn_id", "").strip(),
                "firstname": row.get("firstname", "").strip(),
                "lastname": row.get("lastname", "").strip(),
                "nickname": row.get("nickname", "").strip(),
                "telephone": row.get("telephone", "").strip(),
                "birthdate": row.get("birthdate", "").strip(),
                "synced_at": datetime.now(timezone.utc).isoformat(),
            })

    # Deduplicate by hn_id (keep last occurrence)
    seen = {}
    for r in records:
        seen[r["hn_id"]] = r
    records = list(seen.values())

    print(f"Records: {len(records):,} (unique)")

    # Upsert to Supabase in chunks
    url = f"{SUPABASE_URL}/rest/v1/hn_customers"
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }
    # Modern sb_secret keys must be sent through apikey only. Keep the
    # Authorization header for the legacy JWT service_role key until it is retired.
    if not SUPABASE_KEY.startswith("sb_"):
        headers["Authorization"] = f"Bearer {SUPABASE_KEY}"

    chunk_size = 500
    total = len(records)
    errors = 0

    with httpx.Client(timeout=60) as client:
        for i in range(0, total, chunk_size):
            chunk = records[i : i + chunk_size]
            resp = client.post(url, headers=headers, json=chunk)
            if resp.status_code not in (200, 201):
                errors += 1
                if errors <= 3:
                    print(f"  ERROR at {i}: {resp.status_code} {resp.text[:200]}")
            if (i // chunk_size) % 20 == 0:
                print(f"  {min(i + chunk_size, total):,} / {total:,} ({min(i+chunk_size,total)/total*100:.0f}%)")

    print(f"\nDone! Imported {total:,} records ({errors} errors)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python import_csv.py <path_to_csv>")
        print("Example: python import_csv.py ../hn_lookup_2026-05-08.csv")
        sys.exit(1)
    import_csv(sys.argv[1])
