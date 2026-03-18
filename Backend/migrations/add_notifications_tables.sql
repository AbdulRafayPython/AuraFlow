-- Migration: Add notifications + push_subscriptions tables
-- Date: 2026-03-14

-- Persistent notification storage (replaces localStorage-only approach)
CREATE TABLE IF NOT EXISTS notifications (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL,
    type          VARCHAR(30) NOT NULL,
    title         VARCHAR(255) NOT NULL,
    body          TEXT,
    icon_url      VARCHAR(500),
    link          VARCHAR(500),
    related_id    BIGINT,
    is_read       TINYINT(1) DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notif_user_read (user_id, is_read),
    INDEX idx_notif_user_created (user_id, created_at DESC),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Web Push subscriptions (one per browser per user)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    endpoint        VARCHAR(500) NOT NULL,
    p256dh_key      VARCHAR(200) NOT NULL,
    auth_key        VARCHAR(200) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push_endpoint (endpoint(191)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
