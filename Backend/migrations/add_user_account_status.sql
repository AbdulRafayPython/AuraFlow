-- Add account-level moderation fields to users table
-- account_status: tracks whether user is active, suspended, or banned at the platform level
-- account_status_reason: stores the reason for suspension/ban
-- account_status_until: for temporary suspensions, stores when the restriction expires
-- account_status_by: admin who took the action

ALTER TABLE users ADD COLUMN account_status ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active' AFTER role;
ALTER TABLE users ADD COLUMN account_status_reason TEXT DEFAULT NULL AFTER account_status;
ALTER TABLE users ADD COLUMN account_status_until TIMESTAMP NULL DEFAULT NULL AFTER account_status_reason;
ALTER TABLE users ADD COLUMN account_status_by INT DEFAULT NULL AFTER account_status_until;

-- Create admin_actions table to track all admin actions on users
CREATE TABLE IF NOT EXISTS admin_actions (
  id INT NOT NULL AUTO_INCREMENT,
  admin_id INT NOT NULL,
  target_user_id INT NOT NULL,
  action_type ENUM('warn', 'suspend', 'ban', 'unsuspend', 'unban', 'role_change') NOT NULL,
  reason TEXT DEFAULT NULL,
  details JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_target_user (target_user_id),
  KEY idx_admin (admin_id),
  KEY idx_created (created_at),
  FOREIGN KEY (admin_id) REFERENCES users(id),
  FOREIGN KEY (target_user_id) REFERENCES users(id)
);
