"""
apply_agent_migrations.py — Bring the database Backend/.env points at up to date for the agent platform.

Runs, in order, the agent migrations that this database does not have yet:
  add_agent_runs, add_agent_definitions, add_agent_knowledge, add_agent_approvals,
  add_agent_reminders, add_agent_listings, add_agent_ratings, add_agent_integrations, add_agent_mcp, add_agent_mcp_oauth

Everything is ADDITIVE: new tables, plus these columns on existing tables (all nullable or defaulted,
so existing rows are untouched): users.is_bot, messages.agent_run_id, agent_runs.agent_id / trigger_message_id,
agent_mcp_servers.transport / oauth_json (a table this same script creates).
It never deletes or rewrites data. Nothing is applied unless you pass --apply.

USAGE (from Backend/, with the venv python):
  python scripts/apply_agent_migrations.py            # show the target and what would run
  python scripts/apply_agent_migrations.py --apply    # run it

Take a backup first (a mysqldump of the database). To undo: drop the new agent_* tables and the columns above.
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db_connection  # noqa: E402

ORDER = ["add_agent_runs", "add_agent_definitions", "add_agent_knowledge", "add_agent_approvals",
         "add_agent_reminders", "add_agent_listings", "add_agent_ratings", "add_agent_integrations", "add_agent_mcp", "add_agent_mcp_oauth"]
MIGRATIONS = os.path.join(os.path.dirname(__file__), "..", "migrations")

# A migration is skipped when everything it adds is already there.
MARKERS = {
    "add_agent_runs": ("table", "agent_runs"),
    "add_agent_definitions": ("column", ("users", "is_bot")),
    "add_agent_knowledge": ("table", "agent_knowledge_sources"),
    "add_agent_approvals": ("table", "agent_approvals"),
    "add_agent_reminders": ("table", "agent_reminders"),
    "add_agent_listings": ("table", "agent_listings"),
    "add_agent_ratings": ("table", "agent_listing_ratings"),
    "add_agent_integrations": ("table", "agent_webhooks"),
    "add_agent_mcp": ("table", "agent_mcp_servers"),
    "add_agent_mcp_oauth": ("column", ("agent_mcp_servers", "oauth_json")),
}


def statements(text: str):
    text = re.sub(r"--[^\n]*", "", text)
    return [s.strip() for s in text.split(";") if s.strip()]


def present(cur, kind: str, what) -> bool:
    if kind == "table":
        cur.execute("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = %s", (what,))
    else:
        cur.execute("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() "
                    "AND table_name = %s AND column_name = %s", what)
    return cur.fetchone() is not None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really run the migrations")
    args = parser.parse_args()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DATABASE() AS d, @@hostname AS h, @@port AS p")
            target = cur.fetchone()
            print(f"Target: database '{target['d']}' on {target['h']}:{target['p']}")
            for table in ("users", "messages", "communities"):
                cur.execute(f"SELECT COUNT(*) AS n FROM `{table}`")
                print(f"  {table}: {cur.fetchone()['n']} rows")
            todo = [m for m in ORDER if not present(cur, *MARKERS[m])]
            print("Already applied:", [m for m in ORDER if m not in todo] or "none")
            print("To run:", todo or "nothing")
            if not todo:
                return
            if not args.apply:
                print("\nPreview only. Take a backup, then run again with --apply.")
                return
            for name in todo:
                with open(os.path.join(MIGRATIONS, f"{name}.sql"), encoding="utf-8") as f:
                    for stmt in statements(f.read()):
                        cur.execute(stmt)
                conn.commit()
                print("applied", name)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
