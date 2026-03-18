-- Migration: Add System Admin Role
-- Date: 2025-03-12
-- Description: Adds system admin role support and fixes blocked_users schema
-- =====================================================================

-- 1. Add 'role' column to users table for system-level roles
ALTER TABLE users 
ADD COLUMN role ENUM('user', 'system_admin') NOT NULL DEFAULT 'user' 
AFTER email_verification_expires;

-- 2. Add missing columns to blocked_users (needed by community_admin block endpoint)
ALTER TABLE blocked_users 
ADD COLUMN reason TEXT DEFAULT NULL AFTER blocked_at,
ADD COLUMN blocked_by INT DEFAULT NULL AFTER reason,
ADD FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Set AbdulRafayPython as system_admin (user ID 51)
UPDATE users SET role = 'system_admin' WHERE username = 'AbdulRafayPython';

-- 4. Verify
SELECT id, username, role FROM users WHERE role = 'system_admin';
