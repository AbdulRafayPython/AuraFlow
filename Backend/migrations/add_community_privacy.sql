-- Community privacy and rules (Discord-style join procedure).
-- visibility: 'public' communities are listed in Discover and anyone can join
--             (after accepting the rules); 'private' ones are hidden from
--             Discover and only people an admin adds can join.
-- rules:      one rule per line; shown before joining, must be accepted.
-- Existing communities stay public with no rules (today's behaviour).
ALTER TABLE `communities`
  ADD COLUMN `visibility` ENUM('public','private') NOT NULL DEFAULT 'public'
    COMMENT 'public = listed in Discover, anyone can join; private = invite-only',
  ADD COLUMN `rules` TEXT DEFAULT NULL
    COMMENT 'Community rules, one per line; accepted before joining';
