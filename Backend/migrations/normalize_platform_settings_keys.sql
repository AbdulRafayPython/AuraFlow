-- Normalize platform_settings keys and values to canonical schema.
-- Safe to run multiple times.

START TRANSACTION;

-- 1) Remove payload wrapper pollution rows accidentally persisted by older API behavior.
DELETE FROM platform_settings
WHERE setting_key IN ('success', 'settings');

-- 2) Migrate legacy alias keys to canonical keys if canonical does not already exist.
INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'registration_enabled', ps.setting_value
FROM platform_settings ps
WHERE ps.setting_key = 'allow_registration'
  AND NOT EXISTS (
    SELECT 1 FROM platform_settings p2 WHERE p2.setting_key = 'registration_enabled'
  );

INSERT INTO platform_settings (setting_key, setting_value)
SELECT 'message_rate_limit', ps.setting_value
FROM platform_settings ps
WHERE ps.setting_key = 'rate_limit_per_minute'
  AND NOT EXISTS (
    SELECT 1 FROM platform_settings p2 WHERE p2.setting_key = 'message_rate_limit'
  );

DELETE FROM platform_settings
WHERE setting_key IN ('allow_registration', 'rate_limit_per_minute');

-- 3) Normalize moderation_sensitivity to enum style expected by UI/API.
UPDATE platform_settings
SET setting_value = CASE setting_value
    WHEN '1' THEN 'low'
    WHEN '2' THEN 'medium'
    WHEN '3' THEN 'high'
    ELSE setting_value
END
WHERE setting_key = 'moderation_sensitivity';

COMMIT;
