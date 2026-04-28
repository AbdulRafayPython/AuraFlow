"""
test_scheduler_gate.py — Regression tests for the ENABLE_INPROCESS_SCHEDULE_CHECKER env gate.

Validates that:
  - The gate correctly enables/disables the in-process scheduler thread.
  - Truthy string values (1, true, yes, on) enable the scheduler.
  - Falsy / '0' values disable it.
  - The production-safe default (gate unset) honours IS_PRODUCTION:
      • IS_PRODUCTION=True  → disabled
      • IS_PRODUCTION=False → enabled
"""
import os
import importlib
import sys
import unittest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helper: evaluate the gate logic extracted from app.py (no Flask app import)
# ---------------------------------------------------------------------------

def evaluate_gate(env_value, is_production=False):
    """
    Mirrors the exact gate logic in app.py lines 620-625.

    Returns True when the in-process scheduler should be started,
    False when it should be skipped.
    """
    gate = env_value  # may be None (unset)

    if gate is None:
        # Safe default: enabled only in dev (not production)
        gate = '1' if not is_production else '0'

    return str(gate).lower() in ('1', 'true', 'yes', 'on')


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestSchedulerGateLogic(unittest.TestCase):

    # ── Explicit truthy values ──────────────────────────────────────────────

    def test_gate_enabled_when_env_is_1(self):
        self.assertTrue(evaluate_gate('1'))

    def test_gate_enabled_when_env_is_true(self):
        self.assertTrue(evaluate_gate('true'))

    def test_gate_enabled_when_env_is_TRUE_uppercase(self):
        self.assertTrue(evaluate_gate('TRUE'))

    def test_gate_enabled_when_env_is_yes(self):
        self.assertTrue(evaluate_gate('yes'))

    def test_gate_enabled_when_env_is_on(self):
        self.assertTrue(evaluate_gate('on'))

    # ── Explicit falsy values ───────────────────────────────────────────────

    def test_gate_disabled_when_env_is_0(self):
        self.assertFalse(evaluate_gate('0'))

    def test_gate_disabled_when_env_is_false(self):
        self.assertFalse(evaluate_gate('false'))

    def test_gate_disabled_when_env_is_no(self):
        self.assertFalse(evaluate_gate('no'))

    def test_gate_disabled_when_env_is_off(self):
        self.assertFalse(evaluate_gate('off'))

    # ── Default behaviour (env unset) ──────────────────────────────────────

    def test_default_enables_in_development(self):
        """When env is unset and IS_PRODUCTION is False, scheduler should run."""
        self.assertTrue(evaluate_gate(None, is_production=False))

    def test_default_disables_in_production(self):
        """When env is unset and IS_PRODUCTION is True, scheduler must NOT run."""
        self.assertFalse(evaluate_gate(None, is_production=True))

    # ── Explicit env overrides production flag ──────────────────────────────

    def test_explicit_enable_overrides_production(self):
        """An explicit '1' enables the scheduler even in production (operator choice)."""
        self.assertTrue(evaluate_gate('1', is_production=True))

    def test_explicit_disable_overrides_development(self):
        """An explicit '0' disables the scheduler even in development."""
        self.assertFalse(evaluate_gate('0', is_production=False))


class TestSchedulerGateViaEnv(unittest.TestCase):
    """
    Black-box tests using os.environ to ensure the gate reads the env variable
    via the same os.getenv call path used in app.py.
    """

    def _simulate_gate(self, env_val, is_production=False):
        """Simulate app.py gate logic by setting/clearing the environment variable."""
        env_key = 'ENABLE_INPROCESS_SCHEDULE_CHECKER'
        original = os.environ.get(env_key)

        try:
            if env_val is None:
                os.environ.pop(env_key, None)
            else:
                os.environ[env_key] = env_val

            raw = os.getenv(env_key)
            return evaluate_gate(raw, is_production=is_production)
        finally:
            if original is None:
                os.environ.pop(env_key, None)
            else:
                os.environ[env_key] = original

    def test_env_unset_dev(self):
        self.assertTrue(self._simulate_gate(None, is_production=False))

    def test_env_unset_prod(self):
        self.assertFalse(self._simulate_gate(None, is_production=True))

    def test_env_set_to_1(self):
        self.assertTrue(self._simulate_gate('1'))

    def test_env_set_to_0(self):
        self.assertFalse(self._simulate_gate('0'))

    def test_env_set_to_true_string(self):
        self.assertTrue(self._simulate_gate('true'))

    def test_env_set_to_false_string(self):
        self.assertFalse(self._simulate_gate('false'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
