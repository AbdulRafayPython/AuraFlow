-- Step 2 of 3 for opaque DM/user URLs. Run backfill_user_public_id.py
-- BETWEEN step 1 and this file so every row already has a distinct value
-- before NOT NULL/UNIQUE is enforced.
ALTER TABLE `users`
  MODIFY COLUMN `public_id` char(36) NOT NULL,
  ADD UNIQUE INDEX `idx_user_public_id` (`public_id`);
