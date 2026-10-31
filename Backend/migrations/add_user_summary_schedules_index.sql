-- F4: the per-minute due-schedule sweep (tasks.agent_tasks
-- .check_user_summary_schedules) filtered on TIME_FORMAT(schedule_time,...),
-- which wraps the column in a function and is therefore non-sargable -- no
-- index could ever serve it. The task was full-scanning this table every 60
-- seconds. The query now compares schedule_time as a bare range; this index
-- makes that lookup cheap.
--
-- Leading column is is_active because the query always filters on it, then
-- schedule_time for the range scan.
ALTER TABLE `user_summary_schedules`
  ADD INDEX `idx_uss_due` (`is_active`, `schedule_time`);
