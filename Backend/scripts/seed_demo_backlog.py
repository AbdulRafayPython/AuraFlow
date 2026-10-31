"""
seed_demo_backlog.py — Fill one channel with a realistic unread backlog for the demo video.

Built for Step 1 of the demo script ("Open a channel with 247 unread messages, scroll fast").
Inserts N realistic workplace messages into an existing channel, then rewinds the demo
viewer's read marker so the channel shows exactly N unread while every other member's
channel stays clean.

Unlike seed_database.py this script is ADDITIVE — it never wipes anything. It writes
straight to the DB, so no agent events fire, no LLM calls are made, and nothing is
moderated. That is deliberate: the backlog is scenery, not a test of the agents.

USAGE:
  cd Backend
  python scripts/seed_demo_backlog.py --list                       # show channels to pick from
  python scripts/seed_demo_backlog.py --channel 12 --viewer ayeshakhan
  python scripts/seed_demo_backlog.py --channel 12 --viewer ayeshakhan --count 247 --hours 14

BETWEEN TAKES:
  python scripts/seed_demo_backlog.py --rearm      # badge goes back to N, no new messages
  python scripts/seed_demo_backlog.py --undo       # delete the messages this script inserted

The last run is remembered in scripts/.demo_backlog_state.json, so --rearm and --undo
need no arguments.
"""

import argparse
import json
import os
import random
import sys
from datetime import datetime, timedelta

# Add parent dir so we can import config/database
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from database import get_db_connection

STATE_FILE = os.path.join(os.path.dirname(__file__), ".demo_backlog_state.json")

# ─── MESSAGE BANK ──────────────────────────────────────────────────────
# Grouped into threads so the backlog reads like real conversation when you
# scroll it on camera. Random one-liners look fake; threads do not.
# Roman Urdu is mixed in on purpose — it is what the channel would actually
# look like, and it sets up the translation scene later in the video.

THREADS = [
    ("standup", [
        "morning everyone",
        "assalam o alaikum, standup in 10?",
        "yes give me 5 min, joining from home today",
        "same, internet thoda slow hai but I'm on",
        "ok starting. Ahmed you go first",
        "yesterday: finished the invoice PDF export, today: starting on the refund flow",
        "blockers?",
        "none right now, but I'll need the sandbox keys from Junaid by afternoon",
        "noted, I'll drop them in your DM",
        "Sarah your turn",
        "yesterday I was mostly in code review, today I'm picking up the retry logic",
        "the retry ticket is still assigned to Hamza I think",
        "he's on leave till Wednesday, I'll take it over",
        "reassigned to Sarah",
        "Fatima?",
        "finishing the settings screen, should be in review by lunch",
        "nice, that one has been open for a while",
        "yeah the scope kept growing lol",
        "ok that's everyone. Keep it short today, we have the client call at 3",
        "standup done, 6 minutes, new record",
    ]),
    ("payments-bug", [
        "guys we have a problem on payments",
        "what happened",
        "three customers reported double charges this morning",
        "double charge? on card or wallet",
        "card. both attempts succeeded on the gateway side",
        "that sounds like our retry firing before the gateway responds",
        "yeah I think our timeout is shorter than theirs",
        "what is our timeout set to",
        "8 seconds",
        "and theirs?",
        "30. so we give up, retry, and they process both",
        "oh no",
        "how many transactions affected",
        "checking now",
        "ok 11 transactions since Friday, 3 reported, 8 not yet",
        "we need to refund all 11 before anyone else notices",
        "agreed, don't wait for them to complain",
        "who can run the refunds",
        "I can, I have prod access",
        "do it and log every refund id in the sheet please",
        "also we need an idempotency key on that endpoint, permanently",
        "yes. this is exactly what idempotency keys are for",
        "adding a ticket for it now",
    ]),
    ("hotfix", [
        "raising the timeout to 35s as a hotfix, ok?",
        "do it, but only on the charge endpoint",
        "agreed, don't touch the others",
        "PR is up: #418",
        "looking",
        "one comment, otherwise LGTM",
        "which one",
        "you left a print statement on line 62",
        "haha good catch, removing",
        "updated",
        "approved",
        "merging",
        "deploying to staging first, not straight to prod",
        "yes please. we already had one incident today",
        "staging deploy done",
        "running the payment tests against staging now",
        "all 24 passing",
        "ok ship it",
        "prod deploy started",
        "prod is green, monitoring for 30 mins",
    ]),
    ("design", [
        "dropped the new settings screens in Figma, feedback welcome",
        "opening",
        "the spacing looks much better than last version",
        "thanks, I moved everything to an 8px grid",
        "the toggle labels are still a bit long",
        "which ones",
        "\"Enable automatic message translation for this channel\" is too long for mobile",
        "true, mobile wraps to 3 lines",
        "can we just say \"Auto translate\" and put the rest as helper text",
        "yes that's better",
        "also can the danger zone be at the bottom, not the middle",
        "agreed, delete account should never be next to notification settings",
        "fixed both, re-uploaded",
        "much cleaner",
        "one more thing, the dark mode contrast on the muted text is low",
        "how low",
        "around 3.1, needs to be 4.5",
        "ok I'll darken the background instead of lightening the text",
        "that keeps the look. good call",
        "updated, contrast is 4.8 now",
    ]),
    ("client-call", [
        "reminder: client call at 3pm today",
        "who is joining from our side",
        "me, Ayesha, and Usman for the technical questions",
        "do we have the demo environment ready",
        "yes but the seed data is old, I'll refresh it before the call",
        "please also clear the test messages, last time they saw \"asdasd\" on screen",
        "lol yes that was bad",
        "agenda?",
        "1. progress update 2. the payments incident 3. timeline for phase 2",
        "are we telling them about the incident",
        "yes. they will find out anyway and it looks worse if we hide it",
        "agreed. we fixed it in 4 hours, that's actually a good story",
        "true",
        "I'll prepare a one page summary of what happened and what we changed",
        "perfect",
        "call moved to 3:30, client asked",
        "noted",
    ]),
    ("urdu-chat", [
        "yaar koi chai peene ja raha hai?",
        "main ja raha hun, kitne cups?",
        "do le aana please",
        "mere liye bhi ek, doodh patti",
        "acha theek hai, 5 min",
        "shukriya",
        "yaar ye deadline bohat tight hai",
        "haan mujhe bhi lagta hai, testing ka time nahi milega",
        "hum PM se baat karte hain",
        "usse pehle ek list bana lo kya kya pending hai",
        "sahi baat hai, warna wo maan nahi karega",
        "main abhi list bana raha hun",
        "bhai laptop bohat slow chal raha hai aaj",
        "restart kiya?",
        "haan teen baar",
        "IT ko ticket kar do",
        "kar diya, kal aayenge",
        "kal? acha",
        "office ka wifi bhi aaj weird hai",
        "meri bhi call drop ho rahi thi subah",
    ]),
    ("database", [
        "the dashboard query is taking 4 seconds now",
        "which one",
        "the one that loads community stats on the home page",
        "that used to be under 500ms",
        "yeah it got slower as data grew",
        "did you EXPLAIN it",
        "yes, full table scan on messages",
        "that table has 2 million rows now",
        "there's no index on (channel_id, created_at)?",
        "there is, but the query filters on DATE(created_at) so the index is not used",
        "classic. wrap the column in a function and the index is dead",
        "rewriting it as a range condition instead",
        "created_at >= X AND created_at < Y",
        "exactly",
        "down to 180ms",
        "nice, 20x",
        "adding a regression test so nobody reintroduces it",
        "good idea",
        "also should we archive messages older than a year",
        "not yet, but let's plan for it in phase 2",
        "adding it to the backlog",
        "how big is the database right now",
        "1.8 GB, mostly messages and attachments",
        "attachments should not be in the database at all",
        "they are not, only the urls. the size is genuinely messages",
    ]),
    ("hiring", [
        "we have 3 interviews this week for the frontend role",
        "who is on the panel",
        "me and Sarah for the technical round",
        "what's the format",
        "45 min: 15 discussion, 25 live coding, 5 their questions",
        "what's the coding task",
        "small React component with an API call and loading states",
        "that's reasonable, not a leetcode trap",
        "exactly, I want to see how they handle a loading state and an error, that's the real job",
        "agreed",
        "candidate 1 is at 11 tomorrow",
        "I'll be there",
        "first candidate was strong, good with state, asked good questions about our testing",
        "did she ask about salary band",
        "yes and I told her the range honestly",
        "good, wasting everyone's time otherwise",
    ]),
    ("mobile-qa", [
        "mobile build 2.4.1 is on TestFlight",
        "downloading",
        "the login screen keyboard covers the password field on smaller iPhones",
        "which model",
        "iPhone SE",
        "ah the small one, will fix with a scroll view",
        "also the back button on the channel screen goes to home instead of the community",
        "that's a navigation stack issue, I'll look",
        "one more, the unread badge does not clear until you leave the channel",
        "that one is on my list already",
        "dark mode looks good though",
        "thanks, that took a while",
        "found a crash: open a channel, rotate the phone, crash",
        "can you send the log",
        "sent in DM",
        "got it, it's the layout recalculating on a null view. fixing",
        "fixed in 2.4.2, uploading",
        "confirmed fixed on my side",
    ]),
    ("sprint", [
        "sprint planning tomorrow 11am",
        "how many points did we finish this sprint",
        "31 out of 40",
        "that's better than last sprint",
        "the payments incident ate a full day though",
        "true, should we count that as unplanned work",
        "yes, let's track unplanned separately so the numbers mean something",
        "agreed",
        "what's the priority for next sprint",
        "1. idempotency keys 2. settings screen 3. mobile crashes",
        "what about the export feature the client asked for",
        "that's phase 2, not this sprint",
        "ok as long as we told them that clearly",
        "we did, it's in the meeting notes",
        "can someone put those notes somewhere findable",
        "they are in a Google Doc somewhere in someone's drive",
        "that's the problem, nobody can find anything",
        "we lose half a day every sprint just looking for old decisions",
        "someone should fix that",
        "ok final: we ship Thursday behind a feature flag, Bilal owns the rollback",
    ]),
    ("docs", [
        "the onboarding doc is out of date",
        "how out of date",
        "it still says we use the old auth service",
        "we removed that in March",
        "the new hire followed it for two hours before asking",
        "oof",
        "who owns that doc",
        "nobody, that's the issue",
        "can we at least add a last updated date at the top",
        "and a name so people know who to ask",
        "adding both",
        "honestly most of what a new person needs is in this chat somewhere",
        "yes but scrolling six months of chat is not onboarding",
        "haha true",
        "I'll rewrite the setup section this week",
        "thank you",
    ]),
    ("office", [
        "the office move is on the 14th, don't leave anything on your desk",
        "are we getting bigger desks",
        "yes and actual meeting rooms",
        "finally, no more calls from the corridor",
        "will the internet be ready on day one",
        "they promised. we will see",
        "who is handling the equipment shift",
        "the admin team, but label your monitor",
        "lunch is at 1 today instead of 12:30, meeting ran over",
        "biryani?",
        "no, someone said biryani every day this week",
        "there is no such thing as too much biryani",
        "there is, ask my doctor",
        "haha",
        "ordering from the usual place, send me your orders in 10 min",
        "one chicken karahi",
        "same",
        "two rotis for me only",
    ]),
    ("evening", [
        "logging off, will finish the review in the morning",
        "same, good work on the incident today everyone",
        "genuinely good response time",
        "4 hours from report to prod fix is not bad",
        "next time it should be zero because the bug won't exist",
        "haha optimistic",
        "don't forget the client summary tomorrow morning",
        "it's written, I'll send it at 9",
        "great",
        "one last thing, staging is green and I've left the monitoring dashboard open",
        "if anything spikes overnight it will page whoever is on call",
        "that's me tonight",
        "good luck",
        "good night everyone",
        "night",
        "khuda hafiz",
        "see you tomorrow",
    ]),
]

# Extra standalone lines used only to top up to the requested count.
FILLER = [
    "can someone review my PR when free",
    "done",
    "thanks",
    "which branch is this on",
    "develop",
    "I'll rebase before merging",
    "is staging free right now",
    "yes go ahead",
    "deployed",
    "quick question, is the API docs link still the same",
    "yes, nothing moved",
    "got it",
    "who has the Figma edit access",
    "I'll add you",
    "added",
    "the build is failing on main",
    "looking",
    "flaky test, reran and it passed",
    "we should fix that test properly",
    "ticket created",
    "meeting notes are in the shared drive",
    "link please",
    "sent",
    "is anyone using the test account",
    "I was, done now",
    "thanks",
    "reminder to fill your timesheets today",
    "doing it now",
    "done",
    "anyone else getting logged out randomly",
    "yes, twice today",
    "I'll check the session timeout",
    "it's set to 30 minutes, should be 8 hours",
    "that explains it",
    "fixing",
    "much better now",
    "I'll be 15 min late tomorrow, dentist",
    "no problem",
    "thanks",
    "who is on call this weekend",
    "me",
    "shout if you need backup",
]


def bust_cache(channel_id):
    """Drop the channel's Redis message-list cache.

    GET /channels/<id>/messages serves offset=0 from a Redis list and only
    refills it on a miss. Rows written straight to the DB never touch that
    cache, so without this the backlog stays invisible in the browser no
    matter how hard you refresh.
    """
    try:
        from services.redis_client import invalidate_channel_messages_cache
        invalidate_channel_messages_cache(channel_id)
        print(f"   cache cleared for channel {channel_id}")
    except Exception as exc:
        print(f"   WARNING: could not clear message cache ({exc}).")


def build_message_list(count):
    """Return `count` messages as (thread_name, text), threads kept in order.

    The final thread is the end-of-day sign-off, so any filler needed to reach
    a larger `count` is spliced in *before* it — the backlog should still end
    with people logging off, not with a stray one-liner.
    """
    body = []
    for name, lines in THREADS[:-1]:
        for line in lines:
            body.append((name, line))

    tail_name, tail_lines = THREADS[-1]
    tail = [(tail_name, line) for line in tail_lines]

    shortfall = count - (len(body) + len(tail))
    for i in range(max(0, shortfall)):
        body.append(("misc", FILLER[i % len(FILLER)]))

    return (body + tail)[:count]


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def load_state():
    if not os.path.exists(STATE_FILE):
        return None
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def list_channels(cur):
    cur.execute("""
        SELECT ch.id, ch.name, c.name AS community, COUNT(cm.user_id) AS members
        FROM channels ch
        LEFT JOIN communities c ON c.id = ch.community_id
        LEFT JOIN channel_members cm ON cm.channel_id = ch.id
        WHERE ch.type = 'text'
        GROUP BY ch.id, ch.name, c.name
        ORDER BY members DESC, ch.id
        LIMIT 40
    """)
    rows = cur.fetchall()
    if not rows:
        print("No text channels found. Run scripts/seed_database.py first.")
        return
    print("\n  ID    MEMBERS  CHANNEL                        COMMUNITY")
    print("  " + "-" * 68)
    for r in rows:
        print(f"  {r['id']:<5} {r['members']:<8} #{(r['name'] or '')[:28]:<29} {(r['community'] or '-')[:24]}")
    print("\nPick one with --channel <ID>\n")


def resolve_viewer(cur, channel_id, viewer):
    """Find the demo viewer's user id and confirm they are in the channel."""
    if viewer.isdigit():
        cur.execute("SELECT id, username FROM users WHERE id = %s", (int(viewer),))
    else:
        cur.execute("SELECT id, username FROM users WHERE username = %s", (viewer,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"No user matches --viewer {viewer!r}")

    cur.execute(
        "SELECT 1 FROM channel_members WHERE channel_id = %s AND user_id = %s",
        (channel_id, row["id"]),
    )
    if not cur.fetchone():
        raise SystemExit(
            f"{row['username']} is not a member of channel {channel_id}. "
            "Join the channel in the app first, then rerun."
        )
    return row["id"], row["username"]


def seed(args):
    conn = get_db_connection()
    cur = conn.cursor()

    if args.list:
        list_channels(cur)
        return

    if not args.channel or not args.viewer:
        raise SystemExit("--channel and --viewer are required (or use --list to see channels)")

    viewer_id, viewer_name = resolve_viewer(cur, args.channel, args.viewer)

    # Senders: everyone in the channel except the demo viewer. The viewer's own
    # messages would not count as unread, which would break the badge.
    cur.execute("""
        SELECT u.id, u.username
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = %s AND u.id != %s
    """, (args.channel, viewer_id))
    senders = cur.fetchall()
    if len(senders) < 2:
        raise SystemExit(
            f"Channel {args.channel} needs at least 2 members besides {viewer_name}. "
            "Add more members, or run scripts/seed_database.py."
        )

    messages = build_message_list(args.count)
    print(f"\nSeeding {len(messages)} messages into channel {args.channel}")
    print(f"   viewer:  {viewer_name} (id {viewer_id}) — will see the unread badge")
    print(f"   senders: {len(senders)} other members")

    # Where the viewer's read marker gets rewound to.
    cur.execute("SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE channel_id = %s",
                (args.channel,))
    baseline_id = cur.fetchone()["m"]

    # Spread the backlog over the last N hours, ending 5 minutes ago, so the
    # channel looks like a normal working day rather than a bulk import.
    end = datetime.now() - timedelta(minutes=5)
    start = end - timedelta(hours=args.hours)
    span = (end - start).total_seconds()

    sender_ids = [s["id"] for s in senders]
    cursor_seconds = 0.0
    last_sender = None
    thread_cast = []
    current_thread = None
    inserted = 0

    for idx, (thread, text) in enumerate(messages):
        # Each thread gets a small recurring cast, so a conversation reads like
        # the same 3-4 people talking rather than 40 strangers taking turns.
        if thread != current_thread:
            current_thread = thread
            cast_size = min(len(sender_ids), random.randint(3, 5))
            thread_cast = random.sample(sender_ids, cast_size)
            cursor_seconds += random.uniform(240, 900)   # gap between threads
        else:
            cursor_seconds += random.uniform(25, 110)    # gap inside a thread

        choices = [s for s in thread_cast if s != last_sender] or thread_cast
        sender = random.choice(choices)
        last_sender = sender

        # Keep everything inside the window even if the random walk runs long.
        offset = min(cursor_seconds, span * (idx + 1) / len(messages))
        created = start + timedelta(seconds=offset)

        cur.execute("""
            INSERT INTO messages (channel_id, sender_id, content, message_type, created_at)
            VALUES (%s, %s, %s, 'text', %s)
        """, (args.channel, sender, text, created))
        inserted += 1

        if inserted % 50 == 0:
            print(f"   ... {inserted}/{len(messages)}")

    cur.execute("SELECT COALESCE(MAX(id), 0) AS m FROM messages WHERE channel_id = %s",
                (args.channel,))
    last_id = cur.fetchone()["m"]

    # Viewer's marker goes back to before the batch → exactly `count` unread.
    set_read_marker(cur, viewer_id, args.channel, baseline_id)

    # Everyone else is caught up, so only the demo window shows a badge.
    for s in senders:
        set_read_marker(cur, s["id"], args.channel, last_id)

    cur.execute("SELECT community_id FROM channels WHERE id = %s", (args.channel,))
    row = cur.fetchone()
    community_id = row["community_id"] if row else None
    if community_id:
        cur.execute("""
            INSERT INTO community_unread_status (user_id, community_id, total_unread)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE total_unread = VALUES(total_unread)
        """, (viewer_id, community_id, args.count))

    conn.commit()
    bust_cache(args.channel)

    save_state({
        "channel_id": args.channel,
        "viewer_id": viewer_id,
        "viewer_name": viewer_name,
        "community_id": community_id,
        "baseline_id": baseline_id,
        "last_id": last_id,
        "count": args.count,
        "seeded_at": datetime.now().isoformat(timespec="seconds"),
    })

    print(f"\n   Done. Message ids {baseline_id + 1} to {last_id}")
    print(f"   {viewer_name} now has {args.count} unread in channel {args.channel}")
    print("\n   Next: log in as this user in a FRESH browser session so the count reloads.")
    print("   Between takes: python scripts/seed_demo_backlog.py --rearm")
    print("   To remove:     python scripts/seed_demo_backlog.py --undo\n")


def set_read_marker(cur, user_id, channel_id, message_id):
    cur.execute("""
        INSERT INTO channel_read_status (user_id, channel_id, last_read_message_id)
        VALUES (%s, %s, %s)
        ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id)
    """, (user_id, channel_id, message_id))


def rearm(args):
    """Reset the badge after a take, without inserting anything new."""
    state = load_state()
    if not state:
        raise SystemExit("No previous run found. Seed first.")

    conn = get_db_connection()
    cur = conn.cursor()
    set_read_marker(cur, state["viewer_id"], state["channel_id"], state["baseline_id"])
    if state.get("community_id"):
        cur.execute("""
            INSERT INTO community_unread_status (user_id, community_id, total_unread)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE total_unread = VALUES(total_unread)
        """, (state["viewer_id"], state["community_id"], state["count"]))
    conn.commit()
    print(f"\n   Badge re-armed: {state['viewer_name']} has {state['count']} unread again.")
    print("   Reload the browser (hard refresh) to see it.\n")


def undo(args):
    """Delete exactly the messages this script inserted."""
    state = load_state()
    if not state:
        raise SystemExit("No previous run found, nothing to undo.")

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        DELETE FROM messages
        WHERE channel_id = %s AND id > %s AND id <= %s
    """, (state["channel_id"], state["baseline_id"], state["last_id"]))
    removed = cur.rowcount
    set_read_marker(cur, state["viewer_id"], state["channel_id"], state["baseline_id"])
    conn.commit()
    bust_cache(state["channel_id"])
    os.remove(STATE_FILE)
    print(f"\n   Removed {removed} seeded messages from channel {state['channel_id']}.\n")


def main():
    p = argparse.ArgumentParser(description="Seed an unread backlog for the AuraFlow demo video.")
    p.add_argument("--list", action="store_true", help="list channels and exit")
    p.add_argument("--channel", type=int, help="channel id to fill")
    p.add_argument("--viewer", help="username (or id) that should see the unread badge")
    p.add_argument("--count", type=int, default=247, help="how many messages (default 247)")
    p.add_argument("--hours", type=float, default=14, help="spread messages over this many hours")
    p.add_argument("--seed", type=int, default=None, help="random seed, for identical reruns")
    p.add_argument("--rearm", action="store_true", help="reset the badge after a take")
    p.add_argument("--undo", action="store_true", help="delete the seeded messages")
    args = p.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    if args.rearm:
        rearm(args)
    elif args.undo:
        undo(args)
    else:
        seed(args)


if __name__ == "__main__":
    main()
