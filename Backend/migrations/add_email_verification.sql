-- =============================================
-- Migration: Add email verification columns
-- Run once against the auraflow database
-- =============================================

-- email_verified : 0 = pending, 1 = verified
-- email_verification_token : random token sent in the verification link
-- email_verification_expires : UTC timestamp after which the token is invalid

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER otp_verified_at,
  ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(500) DEFAULT NULL AFTER email_verified,
  ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP NULL DEFAULT NULL AFTER email_verification_token;

-- Fast lookup by token
ALTER TABLE users ADD INDEX idx_email_verification_token (email_verification_token);

-- Back-fill: mark every EXISTING user as verified so they are not locked out
UPDATE users SET email_verified = 1 WHERE email_verified = 0;
