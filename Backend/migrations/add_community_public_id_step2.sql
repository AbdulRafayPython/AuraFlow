-- Step 2 of 3 for opaque community URLs. Run backfill_community_public_id.py
-- BETWEEN step 1 and this file so every row already has a distinct value
-- before NOT NULL/UNIQUE is enforced.
ALTER TABLE `communities`
  MODIFY COLUMN `public_id` char(36) NOT NULL,
  ADD UNIQUE INDEX `idx_community_public_id` (`public_id`);
