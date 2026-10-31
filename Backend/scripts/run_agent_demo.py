"""
Run an agent from the command line and print every step.

    python scripts/run_agent_demo.py "summarize this channel and translate it to Urdu" \
        --user sarah_dev --channel general

Uses the database and LLM key from the environment, so it acts on whatever
DB_HOST points at. Prefer running it inside the Docker stack:

    docker compose exec api python scripts/run_agent_demo.py "..." --user sarah_dev --channel 1

Runs are kept in memory unless --persist is given (needs the agent_runs tables,
see migrations/add_agent_runs.sql).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _one(sql, params):
    from database import get_db_connection
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()
    finally:
        conn.close()


def _short(value, limit=160):
    text = json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("message")
    ap.add_argument("--user", default="sarah_dev", help="username who invokes the agent")
    ap.add_argument("--channel", help="channel id or name for 'current channel'")
    ap.add_argument("--persist", action="store_true", help="write the run to agent_runs")
    args = ap.parse_args()

    from agents.runtime import AURA, ToolContext, run_agent
    from agents.runtime.store import MemoryRunStore, get_default_store

    user = _one("SELECT id FROM users WHERE username = %s", (args.user,))
    if not user:
        print(f"unknown user {args.user!r}")
        return 2

    channel_id = community_id = None
    if args.channel:
        row = (_one("SELECT id, community_id FROM channels WHERE id = %s", (int(args.channel),))
               if args.channel.isdigit()
               else _one("SELECT id, community_id FROM channels WHERE name = %s LIMIT 1", (args.channel,)))
        if not row:
            print(f"unknown channel {args.channel!r}")
            return 2
        channel_id, community_id = row["id"], row["community_id"]

    print(f"DB_HOST={os.getenv('DB_HOST')}  user={args.user}({user['id']})  "
          f"channel={channel_id}  community={community_id}\n")

    store = get_default_store() if args.persist else MemoryRunStore()
    result = run_agent(
        AURA, args.message,
        ctx=ToolContext(invoked_by=user["id"], community_id=community_id, channel_id=channel_id),
        store=store, trigger_type="cli",
    )

    for s in result.steps:
        label = f"{s['kind']:<11}"
        if s.get("tool_name"):
            label += f" {s['tool_name']}"
        detail = s.get("args") if s["kind"] == "tool_call" else s.get("result")
        ms = f"  {s['latency_ms']}ms" if s.get("latency_ms") is not None else ""
        print(f"{s['step_no']:>2}. {label}{ms}\n      {_short(detail)}")

    print(f"\nstatus={result.status}  model={result.model}  tool_calls={result.tool_calls}  "
          f"tokens in/out={result.tokens_in}/{result.tokens_out}  run={result.run_uuid}")
    if result.error:
        print(f"error={result.error}")
    print(f"\n{result.text}")
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
