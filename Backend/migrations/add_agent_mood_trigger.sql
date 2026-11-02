-- Agent trigger for a personal agent: its owner's mood dipped (mood_escalation).
-- Only for personal agents, only the owner's own mood, only while they track it, and the answer
-- is always a DM (see agents/runtime/router_agent.py).
--
-- Only widens the allowed values of agent_triggers.type (one value appended, none removed), so
-- every existing row keeps its value. Rollback: delete mood_escalation triggers, then run the
-- ALTER from add_agent_event_triggers.sql again.
ALTER TABLE `agent_triggers`
  MODIFY COLUMN `type` ENUM('mention','keyword','channel_message','schedule','member_joined','channel_silent','focus_drift','mood_escalation') NOT NULL;
