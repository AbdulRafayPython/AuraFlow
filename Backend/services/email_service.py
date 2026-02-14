# services/email_service.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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


def send_verification_email(to_email: str, verification_token: str, frontend_url: str = "http://localhost:5173"):
    """
    Send email-verification link to a newly registered user.
    The link points to a frontend route which calls the backend verify-email API.
    """
    verify_link = f"{frontend_url}/verify-email?token={verification_token}&email={to_email}"

    subject = "AuraFlow — Verify Your Email Address"
    html_body = f"""
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; background: #1a0b2e; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #a78bfa; margin: 0; font-size: 28px;">AuraFlow</h1>
            <p style="color: #9ca3af; font-size: 14px; margin-top: 4px;">Smart Communication Platform</p>
        </div>
        <div style="background: #2d1b69; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
            <h2 style="color: #e2e8f0; margin: 0 0 12px;">Verify Your Email</h2>
            <p style="color: #9ca3af; font-size: 14px; line-height: 1.6;">
                Thanks for signing up! Click the button below to verify your email address and activate your account.
            </p>
            <div style="text-align: center; margin: 24px 0;">
                <a href="{verify_link}"
                   style="display: inline-block; padding: 12px 32px; background: #6366f1; color: #ffffff;
                          text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">
                    Verify Email Address
                </a>
            </div>
            <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
                Or copy and paste this link into your browser:<br/>
                <a href="{verify_link}" style="color: #818cf8; word-break: break-all;">{verify_link}</a>
            </p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
                This link expires in <strong style="color: #e2e8f0;">24 hours</strong>.
            </p>
        </div>
        <p style="color: #4b5563; font-size: 11px; text-align: center;">
            If you didn't create an AuraFlow account, you can safely ignore this email.
        </p>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL or "no-reply@auraflow.local"
    msg["To"] = to_email

    # Plain-text fallback
    plain = f"Verify your AuraFlow account: {verify_link}\nThis link expires in 24 hours."
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    # DEVELOPMENT fallback
    if not SMTP_EMAIL or not SMTP_APP_PASSWORD:
        print(f"[DEV] Verification link for {to_email}: {verify_link}")
        return

    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.sendmail(SMTP_EMAIL, [to_email], msg.as_string())
    print(f"[EMAIL] Verification email sent to {to_email}")
