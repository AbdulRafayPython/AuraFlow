-- Migration: add violation_count to community_members and blocked_users table
ALTER TABLE community_members
  ADD COLUMN IF NOT EXISTS violation_count INT DEFAULT 0 AFTER role;

CREATE TABLE IF NOT EXISTS blocked_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  community_id INT NOT NULL,
  user_id INT NOT NULL,
  blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (community_id) REFERENCES communities(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_blocked_user (community_id, user_id),
  INDEX idx_blocked_user (user_id)
);
