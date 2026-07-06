-- G1c: Admin-overridable intelligence-profile badge set for communities.
-- NULL means: derive from installed+enabled community_agents
-- (moderation→safe, summarizer→recaps, translator→multilingual).
-- A JSON array (possibly empty) means: admin override wins.
ALTER TABLE `communities`
  ADD COLUMN `intelligence_profile` JSON DEFAULT NULL
  COMMENT 'Subset of {safe,recaps,multilingual}. NULL = use heuristic.';
