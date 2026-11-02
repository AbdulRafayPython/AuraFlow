-- Agent triggers that wake an agent for a channel event: the channel went quiet (channel_silent)
-- or the conversation moved to a new topic (focus_drift).
--
-- Only widens the allowed values of agent_triggers.type (new values are appended, none removed),
-- so every existing row keeps its value. Rollback: delete triggers of the two new types, then
-- run this ALTER again without them.
ALTER TABLE `agent_triggers`
  MODIFY COLUMN `type` ENUM('mention','keyword','channel_message','schedule','member_joined','channel_silent','focus_drift') NOT NULL;
