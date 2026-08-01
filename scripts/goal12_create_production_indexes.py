#!/usr/bin/env python3
"""Create Goal 12 queue indexes without blocking normal queue writes.

This is intentionally an operator-only command: it connects to the production
Session pooler, prompts locally for the database password, and uses
CREATE INDEX CONCURRENTLY.  It performs no INSERT, UPDATE, or DELETE.
"""

from getpass import getpass
import sys

import psycopg2


HOST = "aws-1-ap-northeast-1.pooler.supabase.com"
PORT = 5432
DATABASE = "postgres"
USER = "postgres.hjuvtsjjtucdirlkdgwa"

INDEXES = (
    (
        "queues_request_id_unique_idx",
        "create unique index concurrently if not exists queues_request_id_unique_idx "
        "on public.queues (request_id) where request_id is not null",
    ),
    (
        "queues_room_date_time_idx",
        "create index concurrently if not exists queues_room_date_time_idx "
        "on public.queues (room_id, date, time_block) where room_id is not null",
    ),
)


def main() -> int:
    if "--production" not in sys.argv:
        print("Refusing to run without --production.")
        return 2

    if input("Type APPLY to create the two production indexes: ").strip() != "APPLY":
        print("Cancelled. No database change was made.")
        return 0

    password = getpass("Production database password (not shown): ")
    try:
        conn = psycopg2.connect(
            host=HOST, port=PORT, dbname=DATABASE, user=USER, password=password,
            connect_timeout=15,
        )
    except psycopg2.OperationalError:
        print("Connection was refused. Check the database password and run again.")
        return 1
    conn.autocommit = True  # Required by CREATE INDEX CONCURRENTLY.
    try:
        with conn.cursor() as cur:
            cur.execute("set lock_timeout = '5s'")
            cur.execute("set statement_timeout = '15min'")
            for name, statement in INDEXES:
                print(f"Creating {name}…")
                cur.execute(statement)
                print(f"{name}: complete")

            cur.execute(
                "select indexname from pg_indexes "
                "where schemaname = 'public' and tablename = 'queues' "
                "and indexname in ('queues_request_id_unique_idx', 'queues_room_date_time_idx') "
                "order by indexname"
            )
            names = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()

    if names != ["queues_request_id_unique_idx", "queues_room_date_time_idx"]:
        print(f"Verification failed; found: {names}")
        return 1

    print("Verified: both Goal 12 indexes exist. No queue rows were changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
