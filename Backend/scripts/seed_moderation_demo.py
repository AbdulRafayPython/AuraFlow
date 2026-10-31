"""
seed_moderation_demo.py — Stage the moderation scene for the demo video.

Inserts a short, realistic exchange that escalates into a personal attack, then
runs the moderation agent's retroactive scan over it so the warning banners
appear in the channel.

Why this exists: the messages already seeded in #mod-demo are too mild for the
agent — it deliberately ignores one sharp line in an ordinary argument. Only a
sustained personal attack clears the confidence cutoff.

STRIKE LADDER (community max_warnings = 3):
  1st violation -> warn    (banner on the message)
  2nd violation -> flag    ("One more violation will result in removal")
  3rd violation -> REMOVE  (kicked from community, added to blocked_users)

Default is 2 violations, which is the dramatic beat without destroying anything.
Passing --violations 3 will genuinely remove the user from the community.

USAGE:
  cd Backend
  python scripts/seed_moderation_demo.py --channel 43
  python scripts/seed_moderation_demo.py --channel 43 --no-scan   # insert only
  python scripts/seed_moderation_demo.py --undo                   # clean up for another take
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db_connection

STATE_FILE = os.path.join(os.path.dirname(__file__), ".moderation_demo_state.json")

# Lead-in messages. These must stay clean — the agent should ignore all of them,
# which is what makes the contrast land when the next two get flagged.
LEAD_IN = [
    ("alirazadev", "pushed the fix for the login bug, can someone review"),
    ("ahmedkhan", "this is the third time this week we have had to patch login"),
    ("alirazadev", "i know, the session handling is fragile, i want to rewrite it"),
    ("ahmedkhan", "we do not have time for a rewrite before the deadline"),
]

# Escalating personal attacks. Verified against the live agent: each returns
# harassment / medium / confidence 0.80, which clears the 0.70 cutoff.
ATTACKS = [
    ("ahmedkhan", "you are worthless and everyone on this team knows it"),
    ("ahmedkhan", "stop talking, nobody wants you here, just quit already"),
    ("ahmedkhan", "you are a complete waste of space, i am done pretending otherwise"),
]


def bust_cache(channel_id):
    """Drop the channel's Redis message-list cache.

    GET /channels/<id>/messages serves offset=0 straight from a Redis list and
    only refills it on a miss. Rows written directly to the DB never touch that
    cache, so without this the API keeps returning the old list and the seeded
    messages are invisible in the browser no matter how hard you refresh.
    """
    try:
        from services.redis_client import invalidate_channel_messages_cache
        invalidate_channel_messages_cache(channel_id)
        print(f"  cache cleared for channel {channel_id}")
    except Exception as exc:
        print(f"  WARNING: could not clear message cache ({exc}).")
        print(f"  The browser may keep showing stale messages for channel {channel_id}.")


def resolve_users(cur, channel_id, usernames):
    """Map username -> id, and confirm each is a member of the channel."""
    cur.execute("""
        SELECT u.id, u.username
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = %s
    """, (channel_id,))
    members = {r["username"]: r["id"] for r in cur.fetchall()}

    missing = [u for u in usernames if u not in members]
    if missing:
        raise SystemExit(
            f"Not members of channel {channel_id}: {', '.join(missing)}\n"
            f"Available: {', '.join(sorted(members)) or '(none)'}"
        )
    return members


def seed(args):
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT community_id, name FROM channels WHERE id = %s", (args.channel,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"Channel {args.channel} does not exist.")
    community_id, channel_name = row["community_id"], row["name"]

    attacks = ATTACKS[:args.violations]
    script = LEAD_IN + attacks
    users = resolve_users(cur, args.channel, {u for u, _ in script})

    # The strike ladder reads community_members.violation_count — a permanent
    # lifetime counter that is incremented and persisted on every flag. It is
    # NOT the 24-hour ai_agent_logs count, and it never decays on its own.
    attacker = attacks[0][0]
    cur.execute("""
        SELECT violation_count FROM community_members
        WHERE community_id = %s AND user_id = %s
    """, (community_id, users[attacker]))
    row = cur.fetchone()
    prior = int((row or {}).get("violation_count") or 0)

    cur.execute("""
        SELECT COALESCE(JSON_UNQUOTE(JSON_EXTRACT(settings, '$.max_warnings')), 3) AS mw
        FROM community_agents WHERE community_id = %s AND agent_type = 'moderation'
    """, (community_id,))
    row = cur.fetchone()
    try:
        removal_at = max(1, min(10, int((row or {}).get("mw") or 3)))
    except (TypeError, ValueError):
        removal_at = 3

    total_strikes = prior + len(attacks)
    print(f"\nChannel #{channel_name} (id {args.channel}, community {community_id})")
    print(f"  {attacker} stored violation_count = {prior}")
    print(f"  adding {len(attacks)} -> {total_strikes}; removal happens at {removal_at}")
    if total_strikes >= removal_at:
        print(f"\n  STOP: {total_strikes} >= {removal_at}, so {attacker} WILL BE REMOVED from the")
        print("  community — membership deleted and a blocked_users row added.")
        print(f"  Use --violations {max(1, removal_at - prior - 1)} instead, or reset the counter:")
        print(f"    UPDATE community_members SET violation_count = 0"
              f" WHERE community_id = {community_id} AND user_id = {users[attacker]};")
        if not args.allow_removal:
            raise SystemExit("\n  Aborted. Pass --allow-removal if you genuinely want the removal shot.\n")

    # Space them out like a real argument: the lead-in over a few minutes,
    # the attacks close together.
    now = datetime.now()
    start = now - timedelta(minutes=6)
    inserted = []
    for i, (username, content) in enumerate(script):
        created = start + timedelta(seconds=i * 45)
        cur.execute("""
            INSERT INTO messages (channel_id, sender_id, content, message_type, created_at)
            VALUES (%s, %s, %s, 'text', %s)
        """, (args.channel, users[username], content, created))
        cur.execute("SELECT LAST_INSERT_ID() AS id")
        mid = cur.fetchone()["id"]
        inserted.append(mid)
        mark = "  <-- attack" if (username, content) in attacks else ""
        print(f"  msg {mid}  {username:<12} {content[:52]}{mark}")

    conn.commit()
    bust_cache(args.channel)

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "channel_id": args.channel,
            "community_id": community_id,
            "message_ids": inserted,
            "attacker_id": users[attacker],
            "attacker": attacker,
            "prior_violation_count": prior,
            "seeded_at": now.isoformat(timespec="seconds"),
        }, f, indent=2)

    if args.no_scan:
        print("\n  Inserted, not scanned (--no-scan).")
        print(f"  Scan later with: python scripts/seed_moderation_demo.py --channel {args.channel} --scan-only\n")
        return

    run_scan(args.channel, community_id)


def run_scan(channel_id, community_id):
    """Retroactive scan. The agent emits moderation_retroactive socket events,
    so banners appear in any browser currently viewing the channel."""
    from agents.moderation import ModerationAgent

    print("\n  Running moderation scan...")
    agent = ModerationAgent()
    # 2 hours is plenty for messages just inserted, and keeps the scan from
    # re-reading the whole channel history.
    result = agent.retroactive_scan(
        channel_id=channel_id, community_id=community_id,
        hours_back=2, batch_size=10,
    )
    print(f"  scanned={result['scanned']}  flagged={result['flagged']}  errors={result['errors']}")

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT l.message_id, l.output_text, l.confidence_score, m.content
        FROM ai_agent_logs l
        LEFT JOIN messages m ON m.id = l.message_id
        WHERE l.channel_id = %s AND l.action_type = 'moderation'
          AND l.created_at >= NOW() - INTERVAL 5 MINUTE
          AND (l.output_text LIKE %s OR l.output_text LIKE %s)
        ORDER BY l.id
    """, (channel_id, '%warn%', '%flag%'))
    rows = cur.fetchall()
    if rows:
        print("\n  Flagged:")
        for r in rows:
            print(f"    msg {r['message_id']} conf={r['confidence_score']} | {(r['content'] or '')[:50]}")
    print("\n  Open the channel in the browser to see the banners.")
    print("  Another take: python scripts/seed_moderation_demo.py --undo\n")


def undo(args):
    state_path = STATE_FILE
    if not os.path.exists(state_path):
        raise SystemExit("No previous run found, nothing to undo.")
    with open(state_path, encoding="utf-8") as f:
        state = json.load(f)

    ids = state["message_ids"]
    conn = get_db_connection()
    cur = conn.cursor()

    placeholders = ",".join(["%s"] * len(ids))
    # Logs first — they reference the messages and are what makes the strike
    # count stick between takes.
    cur.execute(f"DELETE FROM ai_agent_logs WHERE message_id IN ({placeholders})", ids)
    logs = cur.rowcount
    cur.execute(f"DELETE FROM messages WHERE id IN ({placeholders})", ids)
    msgs = cur.rowcount

    # The strike counter is persistent, so undo has to wind it back or the
    # next take starts closer to removal than the last one did.
    restored = None
    if state.get("attacker_id") is not None:
        cur.execute("""
            UPDATE community_members SET violation_count = %s
            WHERE community_id = %s AND user_id = %s
        """, (state.get("prior_violation_count", 0), state["community_id"], state["attacker_id"]))
        restored = state.get("prior_violation_count", 0)

    conn.commit()
    bust_cache(state["channel_id"])
    os.remove(state_path)

    print(f"\n  Removed {msgs} messages and {logs} moderation log rows.")
    if restored is not None:
        print(f"  {state.get('attacker')} violation_count reset to {restored}.")
    print("  Ready for another take.\n")


def main():
    p = argparse.ArgumentParser(description="Stage and flag the moderation demo scene.")
    p.add_argument("--channel", type=int, help="channel id to seed")
    p.add_argument("--violations", type=int, default=2, choices=[1, 2, 3],
                   help="how many attack messages (3 removes the user!)")
    p.add_argument("--allow-removal", action="store_true",
                   help="proceed even when the strike count will remove the user")
    p.add_argument("--no-scan", action="store_true", help="insert without scanning")
    p.add_argument("--scan-only", action="store_true", help="scan an already-seeded channel")
    p.add_argument("--undo", action="store_true", help="delete seeded messages and their logs")
    args = p.parse_args()

    if args.undo:
        undo(args)
        return
    if args.scan_only:
        if not args.channel:
            raise SystemExit("--scan-only needs --channel")
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT community_id FROM channels WHERE id = %s", (args.channel,))
        run_scan(args.channel, cur.fetchone()["community_id"])
        return
    if not args.channel:
        raise SystemExit("--channel is required")
    seed(args)


if __name__ == "__main__":
    main()
