-- =====================================================================
-- Migration: Session Management Tables
-- Adds refresh token tracking and access token blocklisting
-- Run: mysql -u root -p auraflow < migrations/add_session_management.sql
-- =====================================================================

USE auraflow;

-- Refresh tokens table: tracks every refresh token issued per session/device
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jti VARCHAR(36) NOT NULL UNIQUE,              -- JWT Token ID (UUID from flask-jwt-extended)
    user_id INT NOT NULL,
    token_family VARCHAR(36) NOT NULL,             -- Family UUID for rotation tracking & reuse detection
    device_info VARCHAR(500) DEFAULT NULL,          -- User-Agent string
    ip_address VARCHAR(45) DEFAULT NULL,            -- IPv4 or IPv6
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,         -- NULL = active, set on revocation
    replaced_by VARCHAR(36) DEFAULT NULL,           -- JTI of the replacement token (rotation chain)

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_refresh_jti (jti),
    INDEX idx_refresh_user_id (user_id),
    INDEX idx_refresh_family (token_family),
    INDEX idx_refresh_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Access token blocklist: for early revocation (e.g., on logout before natural expiry)
CREATE TABLE IF NOT EXISTS token_blocklist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    jti VARCHAR(36) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,                  -- Matches the original token's exp; auto-cleanup after

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_blocklist_jti (jti),
    INDEX idx_blocklist_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
