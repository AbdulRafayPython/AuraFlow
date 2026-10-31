"""
seed_demo_agents.py — Create the live "Campus FAQ" agent used by docs/DEMO_SCRIPT.md.

ADDITIVE and idempotent: it never wipes anything and does nothing if the agent already
exists in that community. It only writes the agent (bot user, definition, @mention
trigger, three knowledge notes) and publishes it. No LLM calls are made.

USAGE:
  cd Backend
  python scripts/seed_demo_agents.py --list                                   # communities and admins
  python scripts/seed_demo_agents.py --community "CS Department" --owner sarah_dev           # preview
  python scripts/seed_demo_agents.py --community "CS Department" --owner sarah_dev --apply   # write
  python scripts/seed_demo_agents.py --community "CS Department" --remove --apply            # archive it

Check which database Backend/.env points at before using --apply.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db_connection  # noqa: E402

AGENT_NAME = "Campus FAQ"
DESCRIPTION = "Answers hostel, exam and library questions from the department notes."
NOTES = [
    ("Hostel", "Hostel rent is 1200 AED per month and is due on the 1st of every month. "
               "Late payment after the 5th adds a 50 AED fee. Visitors are allowed until 9 pm."),
    ("Exams", "Mid-term exams start on the second Monday of the semester. Students must carry "
              "their university ID card. A missed exam needs a medical certificate within 3 days."),
    ("Library", "The library is open 8 am to 10 pm on weekdays and 10 am to 4 pm on weekends. "
                "Each student can borrow 4 books for 14 days; renewals are online."),
]


def _one(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchone()


def list_options(cur):
    print("Communities:")
    cur.execute("SELECT id, name FROM communities ORDER BY id")
    for r in cur.fetchall():
        print(f"  {r['id']:>4}  {r['name']}")
    print("\nAgents already there:")
    cur.execute("SELECT d.id, d.name, d.status, d.community_id FROM agent_definitions d ORDER BY d.id")
    for r in cur.fetchall():
        print(f"  {r['id']:>4}  {r['name']}  [{r['status']}]  community={r['community_id']}")


def find_community(cur, value):
    row = (_one(cur, "SELECT id, name FROM communities WHERE id = %s", (int(value),)) if value.isdigit()
           else _one(cur, "SELECT id, name FROM communities WHERE name = %s", (value,)))
    if not row:
        sys.exit(f"No community '{value}'. Run with --list.")
    return row


def find_existing(cur, community_id):
    return _one(cur, "SELECT id FROM agent_definitions WHERE community_id = %s AND name = %s "
                     "AND status <> 'archived'", (community_id, AGENT_NAME))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--list", action="store_true")
    p.add_argument("--community", help="community name or id")
    p.add_argument("--owner", help="username that owns the agent (needs to be able to create agents there)")
    p.add_argument("--apply", action="store_true", help="really write (otherwise only a preview)")
    p.add_argument("--remove", action="store_true", help="archive the demo agent instead of creating it")
    args = p.parse_args()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if args.list or not args.community:
                list_options(cur)
                return
            community = find_community(cur, args.community)
            existing = find_existing(cur, community["id"])

            if args.remove:
                if not existing:
                    print(f"No '{AGENT_NAME}' in {community['name']}; nothing to remove.")
                    return
                print(f"Would archive '{AGENT_NAME}' (id {existing['id']}) in {community['name']}.")
                if not args.apply:
                    return print("Preview only. Add --apply to do it.")
                from agents.runtime import builder, definitions
                defn = definitions.get_definition(existing["id"], include_inactive=True)
                builder.set_status(cur, defn, "archived")
                conn.commit()
                definitions.invalidate_cache()
                return print("Archived.")

            if existing:
                return print(f"'{AGENT_NAME}' already exists in {community['name']} (id {existing['id']}). Nothing to do.")
            if not args.owner:
                sys.exit("--owner is required.")
            owner = _one(cur, "SELECT id FROM users WHERE username = %s", (args.owner,))
            if not owner:
                sys.exit(f"No user '{args.owner}'.")

            print(f"Would create '{AGENT_NAME}' in {community['name']} for {args.owner}, "
                  f"with {len(NOTES)} knowledge notes, and publish it.")
            if not args.apply:
                return print("Preview only. Add --apply to write.")

            from agents.runtime import builder, definitions, knowledge
            from agents.runtime.templates import get_template
            if not builder.can_create(cur, owner["id"], community["id"]):
                sys.exit(f"{args.owner} is not allowed to create agents in {community['name']}.")
            tpl = get_template("faq")
            fields = {"name": AGENT_NAME, "description": DESCRIPTION, "instructions": tpl.instructions,
                      "tools": list(tpl.tools), "model_tier": tpl.model_tier}
            agent_id, public_id = builder.create_agent(
                cur, owner_id=owner["id"], community_id=community["id"], fields=fields,
                triggers=list(tpl.triggers), template_key=tpl.key)
            for title, text in NOTES:
                knowledge.add_source(cur, agent_id, type="text", title=title, text=text)
            conn.commit()
            defn = definitions.get_definition(agent_id, include_inactive=True)
            builder.set_status(cur, defn, "active")
            conn.commit()
            definitions.invalidate_cache()
            print(f"Created and published '{AGENT_NAME}' (id {agent_id}, {public_id}). "
                  "Wait ~10 s for the router cache, then try: @campus_faq hostel rent kab dena hai?")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
