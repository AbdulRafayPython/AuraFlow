"""Update all user avatars to anime & cool DiceBear styles."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from database import get_db_connection

# Mix of anime & cool avatar styles from DiceBear (free, no auth)
STYLES = [
    "adventurer",    # anime adventure characters
    "lorelei",       # artistic lineart anime faces
    "notionists",    # notion-style character illustrations
    "big-smile",     # big smile cartoon faces
    "personas",      # cool persona illustrations
    "fun-emoji",     # fun emoji-style faces
]

BACKGROUNDS = "b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf"

conn = get_db_connection()
cur = conn.cursor()
cur.execute("SELECT id, username FROM users ORDER BY id")
users = cur.fetchall()

for i, u in enumerate(users):
    style = STYLES[i % len(STYLES)]
    url = f"https://api.dicebear.com/9.x/{style}/svg?seed={u['username']}&backgroundColor={BACKGROUNDS}"
    cur.execute("UPDATE users SET avatar_url = %s WHERE id = %s", (url, u["id"]))

conn.commit()
print(f"✅ Updated avatars for {len(users)} users")
print()
for i, u in enumerate(users):
    style = STYLES[i % len(STYLES)]
    print(f"  {u['username']:20s} → {style}")
cur.close()
conn.close()
