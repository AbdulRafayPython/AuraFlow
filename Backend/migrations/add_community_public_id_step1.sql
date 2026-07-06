-- Step 1 of 3 for opaque community URLs: add the column nullable first.
-- Do NOT use `DEFAULT (UUID())` here — MySQL/TiDB evaluate a non-deterministic
-- default expression ONCE per ALTER TABLE, so every existing row would get the
-- SAME uuid and violate the uniqueness we add in step 2. Run
-- backfill_community_public_id.py between step 1 and step 2 to give each row
-- a distinct value.
ALTER TABLE `communities`
  ADD COLUMN `public_id` char(36) NULL
  COMMENT 'Opaque external identifier used in URLs/API instead of the sequential int id';
