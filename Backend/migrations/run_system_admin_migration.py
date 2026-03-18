"""Run migration to add system admin role and fix blocked_users schema."""
from dotenv import load_dotenv
load_dotenv()
import pymysql, os

conn = pymysql.connect(
    host=os.getenv('DB_HOST'),
    user=os.getenv('DB_USER'),
    password=os.getenv('DB_PASSWORD'),
    database=os.getenv('DB_NAME'),
    port=int(os.getenv('DB_PORT', '3306'))
)
cur = conn.cursor()

# 1. Add role column to users
print('Adding role column to users...')
cur.execute(
    "ALTER TABLE users ADD COLUMN role ENUM('user', 'system_admin') NOT NULL DEFAULT 'user' AFTER email_verification_expires"
)
print('Done.')

# 2. Add reason and blocked_by to blocked_users
print('Adding reason column to blocked_users...')
cur.execute('ALTER TABLE blocked_users ADD COLUMN reason TEXT DEFAULT NULL AFTER blocked_at')
print('Done.')

print('Adding blocked_by column to blocked_users...')
cur.execute('ALTER TABLE blocked_users ADD COLUMN blocked_by INT DEFAULT NULL AFTER reason')
print('Done.')

print('Adding FK for blocked_by...')
cur.execute('ALTER TABLE blocked_users ADD FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL')
print('Done.')

# 3. Set AbdulRafayPython as system_admin
print('Setting AbdulRafayPython as system_admin...')
cur.execute("UPDATE users SET role = 'system_admin' WHERE username = 'AbdulRafayPython'")
print(f'Updated {cur.rowcount} rows')

conn.commit()

# 4. Verify
cur.execute("SELECT id, username, role FROM users WHERE role = 'system_admin'")
print('System admins:', cur.fetchall())

cur.execute('DESCRIBE blocked_users')
print('blocked_users schema:', [(c[0], c[1]) for c in cur.fetchall()])

conn.close()
print('Migration complete!')
