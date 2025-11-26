# services/email_service.py
import smtplib
from email.mime.text import MIMEText
from config import SMTP_EMAIL, SMTP_SERVER, SMTP_PORT, SMTP_APP_PASSWORD

def send_otp_email(to_email: str, otp: str):
    subject = "AuraFlow Password Reset OTP"
    body = f"Your AuraFlow password reset code is: {otp}\nThis code is valid for 5 minutes."
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL or "no-reply@auraflow.local"
    msg["To"] = to_email

    # DEVELOPMENT fallback — prints OTP to console when SMTP not configured
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        print(f"[DEV] OTP for {to_email}: {otp}")
        return

    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
