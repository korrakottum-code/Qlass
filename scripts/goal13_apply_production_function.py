#!/usr/bin/env python3
"""Apply only the reviewed Goal 13 database function to production.

This is deliberately *not* a general migration runner.  It has a narrow,
operator-confirmed purpose: install the already-reviewed create_queue_v1
function while refusing to apply Goal 11D or any other migration.  It never
inserts, updates, or deletes business data.

After this command verifies and commits the function, the operator must record
only version 20260724192700 with `supabase migration repair --status applied`.
That separate CLI step is intentional: it prevents an accidental db push from
also applying the pending Goal 11D migration.
"""

from getpass import getpass
import hashlib
from pathlib import Path
import sys

import psycopg2


HOST = "aws-1-ap-northeast-1.pooler.supabase.com"
PORT = 5432
DATABASE = "postgres"
USER = "postgres.hjuvtsjjtucdirlkdgwa"
GOAL13_VERSION = "20260724192700"
GOAL11D_VERSION = "20260724192800"
FUNCTION_SIGNATURE = "public.create_queue_v1(uuid, uuid, uuid, jsonb)"
MIGRATION_FILE = Path(__file__).resolve().parents[1] / "supabase/migrations/20260724192700_goal13_create_queue_v1.sql"
MIGRATION_SHA256 = "1ea5bce7dfa228e1d65e0e11b885f6cdb817a6b022fdc545b09fc34f209ec91d"
REQUIRED_INDEXES = {"queues_request_id_unique_idx", "queues_room_date_time_idx"}


def fail(message: str) -> None:
    print(f"STOP: {message}")
    raise SystemExit(1)


def migration_sql() -> str:
    sql = MIGRATION_FILE.read_text(encoding="utf-8")
    if hashlib.sha256(sql.encode("utf-8")).hexdigest() != MIGRATION_SHA256:
        fail("local Goal 13 migration differs from the reviewed checksum")
    if "create or replace function public.create_queue_v1" not in sql.lower():
        fail("reviewed Goal 13 function is missing from the local migration file")
    if "revoke all on function public.create_queue_v1" not in sql.lower():
        fail("local migration does not revoke browser execution")
    return sql


def scalar(cur, statement: str, params=()):
    cur.execute(statement, params)
    row = cur.fetchone()
    return row[0] if row else None


def preflight(cur) -> tuple[int, int]:
    versions = {
        row[0]
        for row in cur.execute(
            "select version from supabase_migrations.schema_migrations where version in (%s, %s)",
            (GOAL13_VERSION, GOAL11D_VERSION),
        ) or cur.fetchall()
    }
    if GOAL13_VERSION in versions:
        fail("Goal 13 is already recorded; do not rerun or repair history")
    if GOAL11D_VERSION in versions:
        fail("Goal 11D is already recorded while Goal 13 is absent; investigate migration history manually")

    exists = scalar(cur, "select to_regprocedure(%s) is not null", (FUNCTION_SIGNATURE,))
    if exists:
        fail("create_queue_v1 already exists without Goal 13 history; stop for investigation")

    required_columns = {"request_id", "effective_duration_blocks", "effective_price", "effective_commission_rate"}
    cur.execute(
        "select column_name from information_schema.columns "
        "where table_schema = 'public' and table_name = 'queues' and column_name = any(%s)",
        (list(required_columns),),
    )
    found_columns = {row[0] for row in cur.fetchall()}
    if found_columns != required_columns:
        fail(f"Goal 12 queue columns are incomplete: found {sorted(found_columns)}")

    cur.execute(
        "select indexname from pg_indexes where schemaname = 'public' and tablename = 'queues' "
        "and indexname = any(%s)",
        (list(REQUIRED_INDEXES),),
    )
    found_indexes = {row[0] for row in cur.fetchall()}
    if found_indexes != REQUIRED_INDEXES:
        fail(f"Goal 12 queue indexes are incomplete: found {sorted(found_indexes)}")

    audit_exists = scalar(cur, "select to_regclass('public.queue_audit') is not null")
    if not audit_exists:
        fail("Goal 12 queue_audit table is missing")

    queue_count = scalar(cur, "select count(*) from public.queues")
    audit_count = scalar(cur, "select count(*) from public.queue_audit")
    print(f"Preflight passed: queues={queue_count}, queue_audit={audit_count}.")
    print("No business row will be changed; this command only creates or replaces one database function.")
    return queue_count, audit_count


def verify_function(cur) -> None:
    definition = scalar(cur, "select pg_get_functiondef(%s::regprocedure)", (FUNCTION_SIGNATURE,))
    if not definition or "SET search_path TO ''" not in definition:
        fail("function verification failed: search_path is not empty")

    cur.execute(
        "select rolname, has_function_privilege(rolname, %s::regprocedure, 'execute') "
        "from pg_roles where rolname in ('anon', 'authenticated') order by rolname",
        (FUNCTION_SIGNATURE,),
    )
    browser_grants = {role: allowed for role, allowed in cur.fetchall()}
    if any(browser_grants.values()):
        fail(f"function verification failed: browser execute grant found: {browser_grants}")

    public_allowed = scalar(cur, "select has_function_privilege('public', %s::regprocedure, 'execute')", (FUNCTION_SIGNATURE,))
    if public_allowed:
        fail("function verification failed: PUBLIC execute grant found")

    print("Verified: create_queue_v1 has an empty search path and no browser/PUBLIC execute grant.")


def main() -> int:
    if "--production" not in sys.argv:
        print("Refusing to run without --production.")
        return 2
    if input("Type APPLY_GOAL13 to install only the Goal 13 function: ").strip() != "APPLY_GOAL13":
        print("Cancelled. No database change was made.")
        return 0

    sql = migration_sql()
    password = getpass("Production database password (not shown): ")
    try:
        conn = psycopg2.connect(
            host=HOST, port=PORT, dbname=DATABASE, user=USER, password=password,
            connect_timeout=15,
        )
    except psycopg2.OperationalError:
        print("Connection was refused. Check the database password and run again.")
        return 1

    try:
        with conn.cursor() as cur:
            preflight(cur)
            cur.execute("set local lock_timeout = '5s'")
            cur.execute("set local statement_timeout = '60s'")
            cur.execute(sql)
            verify_function(cur)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print("Goal 13 function committed. No queue, customer, HN, staff, or session row was changed by this command.")
    print("Next, in a separate terminal, record ONLY this reviewed migration:")
    print("  supabase migration repair --linked --status applied 20260724192700")
    print("Then run `supabase migration list --linked` and confirm Goal 13 is remote-applied while Goal 11D remains pending.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
