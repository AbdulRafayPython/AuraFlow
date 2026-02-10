# services/otp_service.py
import random
import datetime
import bcrypt
from database import get_db_connection   # your existing DB helper

OTP_TTL_MINUTES = 5  # 5 minutes

def _hash(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode('utf-8')

def _check(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())

def create_and_store_otp(email: str) -> str:
    otp = f"{random.randint(100000, 999999)}"
    otp_hash = _hash(otp)
    expires_at = datetime.datetime.now() + datetime.timedelta(minutes=OTP_TTL_MINUTES)

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM otp_codes WHERE email = %s", (email,))
            cur.execute(
                "INSERT INTO otp_codes (email, otp_hash, expires_at) VALUES (%s, %s, %s)",
                (email, otp_hash, expires_at)
            )
        conn.commit()
    finally:
        conn.close()

    return otp

def verify_otp(email: str, otp: str) -> tuple[bool, str]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT otp_hash, expires_at FROM otp_codes WHERE email = %s ORDER BY created_at DESC LIMIT 1",
                (email,)
            )
            row = cur.fetchone()
            if not row:
                return False, "OTP not found"

            expires_at = row["expires_at"]
            if datetime.datetime.now() > expires_at:
                return False, "OTP expired"

            if not _check(str(otp), row["otp_hash"]):
                return False, "Invalid OTP"

        conn.commit()
    finally:
        conn.close()

    return True, ""
