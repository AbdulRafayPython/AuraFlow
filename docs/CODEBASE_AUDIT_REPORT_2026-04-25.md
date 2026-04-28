# AuroFlow Codebase Audit Report

Date: April 25, 2026
Scope: Full-stack review (Backend + Frontend)
Auditor mode: Static review + lint/build/test execution
Environment: Existing Backend venv used (no new venv created)

Remediation status update: April 25, 2026 (post-fix pass)

## 1. Executive Summary

This audit identified critical contract mismatches, duplicated scheduling paths, security hygiene issues, and substantial frontend code-quality debt.

Top risks:
- Platform settings data-contract mismatch between API and UI can cause incorrect configuration behavior.
- Duplicate user-summary scheduling paths (app thread + Celery beat) can cause duplicated work or operational complexity.
- Hardcoded JWT token exists in repository.
- Backend knowledge-builder behavior currently fails tests.
- Frontend lint health is poor (891 issues), increasing maintenance and runtime risk.

Current health snapshot:
- Backend syntax compile check: PASS
- Backend unittest discovery: PASS (knowledge builder suite 19/19)
- Frontend production build: PASS with warnings
- Frontend lint: FAIL (780 errors, 111 warnings)

## 1.1 Post-Audit Remediation Update

Completed since initial audit:
- Removed hardcoded JWT token from manual moderation script.
- Added platform settings compatibility mapping in system-admin frontend.
- Enforced canonical platform settings schema in backend API and aligned seed migration keys/values.
- Added DB normalization migration for historical platform settings key pollution cleanup.
- Added production-safe guard for in-process user schedule checker.
- Standardized email batch interval default to 5 minutes.
- Removed legacy users.notification_settings dependency from get_me SELECT.
- Fixed knowledge builder regressions and restored passing tests.

Status impact:
- Critical security finding C1: Mitigated.
- High platform contract risk H1: Mitigated (canonical API schema + migration path).
- High scheduling risk H2: Mitigated with env gating.
- Medium test failure finding M3: Resolved.
- Frontend lint debt M4: Still open.

---

## 2. Methodology

### 2.1 Commands and Checks Performed

Frontend:
- npm run lint
- npm run build

Backend (existing Backend venv only):
- .\\venv\\Scripts\\python.exe -m unittest discover -s tests -p "test*.py" -v
- .\\venv\\Scripts\\python.exe -m compileall -q agents routes services tasks

Additional analysis:
- Cross-file inspection of API handlers, services, migrations, and system-admin frontend pages.
- Search-based review for potentially unwired/unused files.

### 2.2 Constraints

- pytest was not installed in the existing Backend venv, so unittest discovery was used.
- No code changes were applied in this phase; this document is an audit deliverable.

---

## 3. Findings by Severity

## 3.1 Critical

### C1. Hardcoded JWT token committed in repository
Impact:
- Sensitive token handling policy violation.
- Even if expired, this is a dangerous pattern and may expose active tokens in future commits.

Evidence:
- Backend/test_moderation.py:4

Recommendation:
- Remove token from source immediately.
- Replace with environment variable (e.g., TEST_TOKEN) and fail clearly if missing.
- Rotate any related credentials if this token was valid in any environment.

---

## 3.2 High

### H1. Platform settings API contract mismatch (Backend vs Frontend)
Status: RESOLVED

Symptoms:
- Backend returns wrapped payload: { success, settings }.
- Frontend merges response directly into config object, expecting flat key-value settings.

Impact:
- UI may silently fail to load correct settings.
- Saving can appear successful while loaded values are stale or defaults.

Evidence:
- Backend/routes/admin.py:3682
- Frontend/src/pages/system-admin/PlatformSettings.tsx:55

Additional mismatch:
- Seeded migration keys differ from frontend config keys.
- Example: allow_registration and rate_limit_per_minute vs frontend registration_enabled and message_rate_limit.

Evidence:
- Backend/migrations/add_platform_settings.sql:10
- Backend/migrations/add_platform_settings.sql:15

Recommendation:
- Define one canonical key schema.
- Backend GET should return exactly the object expected by frontend (or frontend must read response.settings explicitly).
- Add schema validation and mapping layer test.

Remediation completed:
- Backend now enforces canonical settings keys and validates values on update.
- Backend supports legacy key aliases while storing canonical keys only.
- Wrapper noise keys (success/settings) are ignored/rejected and no longer persisted.
- Seed migration now uses canonical keys and valid moderation_sensitivity enum values.
- Added dedicated normalization migration for existing polluted rows.

### H2. Duplicate scheduling paths for user summary checks
Symptoms:
- In-app schedule checker thread starts in app.py.
- Celery beat also runs check_user_summary_schedules periodically.

Impact:
- Risk of duplicated work under mixed deployments.
- Operational confusion and race conditions in production topology.

Evidence:
- Backend/app.py:622
- Backend/celery_app.py:108
- Backend/tasks/agent_tasks.py:1054

Recommendation:
- Choose single scheduler authority in production (prefer Celery beat).
- Gate in-process scheduler behind explicit env flag disabled by default in production.

---

## 3.3 Medium

### M1. Notification settings normalization drift risk
Symptoms:
- auth.get_me still selects users.notification_settings.
- Normalization migration includes note to drop old users.notification_settings column.

Impact:
- Potential runtime SQL errors after migration cleanup.
- Inconsistent source-of-truth for notification settings.

Evidence:
- Backend/routes/auth.py:272
- Backend/migrations/normalize_notification_settings.sql:58

Recommendation:
- Fully migrate reads/writes to user_notification_settings table only.
- Remove legacy column references from runtime code before dropping column.

### M2. Inconsistent defaults for email batch interval
Symptoms:
- email_batch_service default uses 1 minute.
- auth notification defaults expose 5 minutes.

Impact:
- Behavior inconsistency depending on code path and user state.

Evidence:
- Backend/services/email_batch_service.py:28
- Backend/routes/auth.py:823

Recommendation:
- Standardize to one default (likely 5 minutes for production expectations).
- Keep single source of defaults in shared module.

### M3. Backend knowledge builder test stability
Status: RESOLVED

Updated results:
- knowledge builder suite now passes: 19/19.

What was corrected:
- Short-message ignore handling refined.
- Definition extraction filters tightened to reduce false positives.
- Tag extraction ordering made deterministic.

Verification:
- .\\venv\\Scripts\\python.exe -m unittest tests.test_knowledge_builder -v => PASS

### M4. Frontend lint debt is very high
Results:
- 891 total lint problems (780 errors, 111 warnings).
- Dominant classes: no-explicit-any, react-hooks/exhaustive-deps, no-empty, forbidden require import pattern.

Impact:
- Reduced type safety and maintainability.
- Increased risk of stale hook state bugs.

Representative evidence:
- Frontend/src/services/adminService.ts
- Frontend/src/services/aiAgentService.ts
- Frontend/src/pages/Settings.tsx:55
- Frontend/tailwind.config.ts:135

Recommendation:
- Introduce phased lint debt burn-down:
  1) services and API layer typing,
  2) hook dependency correctness,
  3) cleanup no-empty and import style violations.

---

## 3.4 Low

### L1. Build chunk-size warnings
Symptoms:
- Large output chunks, including one ~1.2MB minified artifact.

Impact:
- Slower initial load and caching inefficiency.

Evidence:
- Frontend build output warnings.

Recommendation:
- Add manualChunks strategy and validate route-based code splitting effectiveness.
- Remove dynamic imports that are also statically imported when chunking benefit is expected.

---

## 4. Potentially Unused / Unwired Files

Note: Marked as "likely" unused based on wiring/reference checks and runtime behavior; final confirmation should include deployment script and CI pipeline review.

### 4.1 Likely not part of active automated test suite
- Backend/test_moderation.py

Rationale:
- File is outside Backend/tests and not discovered in unittest run.

### 4.2 One-off migration helper scripts (manual use, not runtime wired)
- Backend/scripts/run_migration_notification_settings.py
- Backend/scripts/run_normalize_notification_settings.py

Rationale:
- Manual migration scripts; not imported or executed by app runtime.

### 4.3 Migration files that may be superseded/legacy
- Backend/migrations/add_notification_settings.sql

Rationale:
- Notification settings were normalized into a dedicated table; this older migration may no longer be required in fresh-install path if superseded.

### 4.4 Manual bootstrap migration
- Backend/migrations/add_platform_settings.sql

Rationale:
- Useful for setup, but not auto-executed by app runtime.

### 4.5 Runtime-generated scheduler artifacts (should not be source-controlled)
- Backend/celerybeat-schedule.bak
- Backend/celerybeat-schedule.dat
- Backend/celerybeat-schedule.dir

Rationale:
- Generated state files, environment-specific.

---

## 5. Validation Results

### 5.1 Frontend

Lint:
- Status: FAIL
- Total: 891 issues (780 errors, 111 warnings)

Build:
- Status: PASS
- Warnings:
  - dynamic-import and static-import mixed modules (authService/socketService)
  - large chunk warnings

### 5.2 Backend

Unittest discovery:
- Status: PASS
- Ran: 19 tests
- Failures: 0

Compile check:
- Status: PASS
- Scope: agents, routes, services, tasks

---

## 6. Root Cause Patterns

- Contract drift between backend payload shapes and frontend assumptions.
- Feature evolution without full deprecation cleanup (legacy columns/defaults).
- Multiple orchestration strategies coexisting (thread scheduler + Celery scheduler).
- Type-system discipline not enforced early (large any footprint).
- Test script hygiene gap (hardcoded token committed).

---

## 7. Prioritized Remediation Plan

## Phase 1 (Immediate: security + correctness)
1. Remove hardcoded token from Backend/test_moderation.py and convert to env-driven test config.
2. Fix platform-settings contract/key mismatch end-to-end.
3. Pick single scheduling authority for user summary checks and gate the other path.

## Phase 2 (Stability)
1. Fix failing knowledge-builder tests by adjusting ignore/definition extraction logic.
2. Unify notification-settings source-of-truth and defaults.
3. Remove legacy users.notification_settings runtime dependency.

## Phase 3 (Quality)
1. Address frontend lint in slices:
   - service layer typing first,
   - hook dependency corrections,
   - tailwind config import style and no-empty blocks.
2. Add CI quality gates:
   - frontend lint threshold,
   - backend unit tests,
   - optional mypy/pyright for service interfaces.

## Phase 4 (Performance)
1. Improve Vite chunk strategy and verify route-level split points.
2. Re-measure bundle with baseline and target budgets.

---

## 8. Suggested Ownership Matrix

- Backend API contracts and migrations: Backend owner
- Scheduler topology and Celery operations: Backend/DevOps owner
- Frontend type/lint debt: Frontend owner
- Security hygiene and secret scanning: Shared (with CI ownership)

---

## 9. Acceptance Criteria for Closure

This audit is considered resolved when:
1. No hardcoded secrets/tokens remain in repository.
2. Platform settings load/save roundtrip verified with aligned key schema.
3. Only one active scheduler path in production.
4. Backend tests pass for knowledge builder suite.
5. Frontend lint errors reduced to zero (or documented temporary allowlist with expiration).
6. Legacy/unused files are archived or removed with migration history preserved.

---

## 10. Appendix A: Key Evidence Index

- Backend/test_moderation.py:4
- Backend/routes/admin.py:3682
- Frontend/src/pages/system-admin/PlatformSettings.tsx:55
- Backend/migrations/add_platform_settings.sql:10
- Backend/migrations/add_platform_settings.sql:15
- Backend/app.py:622
- Backend/celery_app.py:108
- Backend/tasks/agent_tasks.py:1054
- Backend/routes/auth.py:272
- Backend/migrations/normalize_notification_settings.sql:58
- Backend/services/email_batch_service.py:28
- Backend/routes/auth.py:823
- Backend/tests/test_knowledge_builder.py:206
- Backend/tests/test_knowledge_builder.py:291

---

## 11. Appendix B: What Was Not Changed

- Source files were modified in post-audit remediation work.
- No package installation or new virtual environment was created.
- No migration was executed during this audit.
