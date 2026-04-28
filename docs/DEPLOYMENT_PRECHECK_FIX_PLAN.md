# AuroFlow Deployment Precheck Fix Plan

Date: April 24, 2026
Status: Planning document created before code fixes
Scope: One month jury evaluation hosting stability

## 1) Goal
Prepare AuroFlow for stable deployment with minimal runtime surprises during jury evaluation.

This document defines:
- what can break in production,
- why it can break,
- what we will change,
- and how we will verify each fix.

## 2) Confirmed High-Risk Findings

### A) Duplicate scheduled summary execution path
Observed in two places:
- In-process scheduler thread in backend app startup.
- Celery beat scheduled task for the same domain behavior.

Why this is risky:
- Possible duplicate summaries.
- More database writes than expected.
- Harder debugging during demo week.

Relevant files:
- Backend/app.py
- Backend/celery_app.py
- Backend/tasks/agent_tasks.py

### B) Production topology mismatch in current deployment blueprint
Current blueprint defines only backend web process, while runtime expects Redis and Celery ecosystem for full behavior.

Why this is risky:
- Background tasks silently not executed.
- Email batch delivery may fail or degrade.
- Periodic agent automations may not run.

Relevant files:
- Backend/render.yaml
- Backend/celery_app.py
- Backend/services/redis_client.py
- Backend/services/email_batch_service.py
- Backend/tasks/email_tasks.py

### C) Heavy AI stack startup and memory pressure
The project includes heavy ML libraries and lazy model loading.

Why this is risky:
- Slow first-request response.
- Higher memory pressure on low-tier hosting.
- Potential process restarts under load.

Relevant files:
- Backend/requirements.txt
- Backend/agents/mood_tracker.py
- Backend/wsgi.py

### D) Local disk uploads on potentially ephemeral hosts
Uploads are saved to local filesystem paths.

Why this is risky:
- Uploaded files may disappear on redeploy or restart.
- Broken media links during jury demo.

Relevant files:
- Backend/routes/uploads.py
- Backend/app.py

### E) Production backend URL coupling in frontend env
Frontend production environment is currently tied to a fixed backend URL.

Why this is risky:
- Rebuild required for every backend URL change.
- Easy misconfiguration before final demo.

Relevant files:
- Frontend/.env.production
- Frontend/src/config/api.ts
- Frontend/src/socket.ts

### F) Missing backend environment template
Backend README references an environment template that is not present.

Why this is risky:
- Setup mistakes.
- Missing variables in deployment.

Relevant files:
- Backend/README.md

## 3) Fix Strategy and Order

Phase 1: Safety and duplication control
1. Add a single toggle to disable in-app user summary scheduler thread in production by default.
2. Keep Celery beat as the single source for scheduled summary execution.
3. Add startup log lines that clearly show which scheduler path is active.

Phase 2: Deployment topology and docs
1. Extend deployment documentation to include required processes:
   - Web
   - Worker
   - Beat
   - Redis
2. Add a production-ready environment template for backend.
3. Add a preflight deployment checklist.

Phase 3: Reliability improvements for jury month
1. Add optional feature flags for heavy AI paths if memory is constrained.
2. Add clear fallback behavior notes for disabled optional services.
3. Add an operational runbook for restart, rollback, and health checks.

Phase 4: Media persistence decision
Choose one:
- temporary acceptance: keep local uploads with known limitations,
- preferred: move uploads to object storage for persistence.

## 4) Proposed New or Updated Artifacts

Planned updates:
- Backend/app.py
- Backend/render.yaml or hosting instructions in docs
- Backend/.env.example (new)
- docs deployment checklist file (new)
- docs runbook file (new)

This current file is the planning anchor:
- docs/DEPLOYMENT_PRECHECK_FIX_PLAN.md

## 5) Verification Checklist Per Fix

### Scheduler duplication fix verification
- Confirm only one scheduler path is active in logs.
- Trigger one due schedule and verify exactly one summary write.
- Verify no duplicate socket summary event for same schedule window.

### Celery and Redis topology verification
- Worker receives tasks.
- Beat emits scheduled tasks.
- Redis health is healthy from API health endpoint.
- Email batch queue and processing succeed end-to-end.

### Heavy AI behavior verification
- Measure first request latency to AI endpoints.
- Confirm process remains stable under repeated agent requests.
- If feature flags used, verify fallback responses are user-safe.

### Upload reliability verification
- Upload image and document.
- Restart service.
- Validate whether links remain available.
- If not persistent, record as accepted temporary limitation or migrate storage.

### Frontend env verification
- Build with intended backend URL.
- Login, API fetch, socket connect, and upload all succeed from deployed frontend.

## 6) Acceptance Criteria For Jury-Ready Deployment

A deployment is accepted when:
- no duplicate scheduled summaries are produced,
- background task pipeline is active and observable,
- health endpoint reports backend healthy with Redis reachable,
- critical flows pass: auth, chat, socket, uploads, notifications,
- setup is reproducible from documented environment template and checklist.

## 7) Change Control For Next Step

Next implementation pass should be small and controlled:
1. Implement scheduler toggle in Backend/app.py.
2. Add Backend/.env.example with all required and optional variables.
3. Add deployment checklist document.
4. Validate with targeted smoke tests.

After each change, update this document status section.

## 8) Status Log

- April 24, 2026: Initial precheck plan created.
- Next: Start Phase 1 code changes.
