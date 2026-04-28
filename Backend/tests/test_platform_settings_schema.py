"""Regression tests for platform settings schema normalization."""

import unittest

from routes.admin import _normalize_platform_settings_input


class TestPlatformSettingsSchema(unittest.TestCase):
    def test_accepts_canonical_keys(self):
        payload = {
            "registration_enabled": True,
            "message_rate_limit": 45,
            "moderation_sensitivity": "high",
            "maintenance_mode": False,
        }
        valid, rejected = _normalize_platform_settings_input(payload)
        self.assertEqual(rejected, [])
        self.assertEqual(valid["registration_enabled"], True)
        self.assertEqual(valid["message_rate_limit"], 45)
        self.assertEqual(valid["moderation_sensitivity"], "high")

    def test_maps_legacy_aliases(self):
        payload = {
            "allow_registration": False,
            "rate_limit_per_minute": 60,
        }
        valid, rejected = _normalize_platform_settings_input(payload)
        self.assertEqual(rejected, [])
        self.assertIn("registration_enabled", valid)
        self.assertIn("message_rate_limit", valid)
        self.assertEqual(valid["registration_enabled"], False)
        self.assertEqual(valid["message_rate_limit"], 60)

    def test_rejects_wrapper_noise_keys(self):
        payload = {
            "success": True,
            "settings": {},
            "bad_key": "x",
            "registration_enabled": True,
        }
        valid, rejected = _normalize_platform_settings_input(payload)
        self.assertEqual(valid, {"registration_enabled": True})
        self.assertIn("bad_key", rejected)

    def test_rejects_invalid_types_and_ranges(self):
        payload = {
            "message_rate_limit": "60",
            "max_file_size_mb": 0,
            "moderation_sensitivity": "critical",
        }
        valid, rejected = _normalize_platform_settings_input(payload)
        self.assertEqual(valid, {})
        self.assertCountEqual(
            rejected,
            ["message_rate_limit", "max_file_size_mb", "moderation_sensitivity"],
        )


if __name__ == "__main__":
    unittest.main()
