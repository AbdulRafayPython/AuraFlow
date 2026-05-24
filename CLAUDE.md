# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## TL;DR Quick Start

1. **Backend**: Copy `.env.example` to `.env` (fill DB_*, JWT_SECRET_KEY, REDIS_URL, GEMINI_API_KEY), then run:
   ```powershell
   redis-server  # in one terminal
   .\Backend\venv\Scripts\python.exe .\Backend\app.py  # API on :5000
   .\Backend\start_celery.bat  # worker + beat (separate terminals)
   ```
2. **Frontend**: `cd Frontend && npm install && npm run dev` (Vite on :5173)

Note: Commands above use Windows syntax. On Linux/Mac, use `./venv/bin/python` instead of `.\venv\Scripts\python.exe`.

## Repository Layout

Two top-level apps share this repo:

- `Backend/` — Flask + Flask-SocketIO + Celery, MySQL via PyMySQL/DBUtils pool. Entrypoint `app.py` (dev) or `wsgi.py` (prod gevent).
- `Frontend/` — React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui (Radix). Entrypoint `src/main.tsx` → `src/App.tsx`.
- `docs/` — design docs, agent specs, audit reports. Useful primary source for cross-cutting context (e.g. `docs/AGENT_INTEGRATION_ARCHITECTURE.md`, `docs/REDIS_CELERY_ARCHITECTURE.md`).

## Run / Build / Test Commands

The project uses an existing venv at `Backend/venv` — do **not** create a new one.

Backend (dev, from `Backend/`):
```bash
./venv/Scripts/python.exe app.py                                                # API + Socket.IO on :5000
./venv/Scripts/python.exe -m celery -A celery_app worker --loglevel=info --pool=solo -Q default,high_priority,periodic
./venv/Scripts/python.exe -m celery -A celery_app beat --loglevel=info          # periodic scheduler
```
The `-Q default,high_priority,periodic` flags are required — without them the worker only consumes the bare `celery` queue and all agent tasks pile up silently. Windows must use `--pool=solo` (or eventlet). Redis must be running on `localhost:6379` before starting Celery. `start_celery.bat` wraps these commands.

Production: `python wsgi.py` (monkey-patches gevent first, then loads `app:app`). Render blueprint is `Backend/render.yaml`.

Backend tests (pytest, from `Backend/`):
```bash
./venv/Scripts/python.exe -m pytest tests/UNIT_TESTING/                                       # unit (incl. autonomous-agents under tests/UNIT_TESTING/agents/)
./venv/Scripts/python.exe -m pytest tests/INTEGRATION_TESTING/                                # integration (hits real services)
./venv/Scripts/python.exe -m pytest tests/SYSTEM_TESTING/ tests/UAT/                          # system + UAT journeys (incl. tests/UAT/test_agent_chains.py)
./venv/Scripts/python.exe -m pytest tests/UNIT_TESTING/agents/test_moderation_autonomous.py   # single file
./venv/Scripts/python.exe -m pytest tests/UAT/test_agent_chains.py tests/UNIT_TESTING/agents/ # autonomous-agents headline suite (~124 tests, ~30 s)
```
All Backend tests live under `Backend/tests/` in four tiers: `UNIT_TESTING/`, `INTEGRATION_TESTING/`, `SYSTEM_TESTING/`, `UAT/`. The autonomous-agent unit suite is `tests/UNIT_TESTING/agents/`; its end-to-end chain UATs are in `tests/UAT/test_agent_chains.py`. Each tier's `conftest.py` inserts `Backend/` onto `sys.path`.

Frontend (from `Frontend/`):
```bash
npm install            # first time
npm run dev            # Vite on :5173, proxies /api /socket.io /uploads to :5000
npm run build          # production
npm run lint           # eslint
npx vitest run         # tests live in Frontend/__tests__/ (currently just one integration test). No `npm test` script — invoke vitest directly.
```

## Architecture

### Backend: monolithic Flask app, agent work offloaded to Celery

- `app.py` builds the Flask app, configures CORS, JWT, security headers, gzip, and registers every route. Routes are split into per-domain modules in `routes/` (auth, channels, messages, friends, agents, admin, community_admin, sockets, uploads, reactions, search, pins, status, notifications). Some are exposed by importing functions and calling `app.route(...)(fn)`; others use Blueprints (`*_bp`). Both styles coexist — match the existing style of the file you edit.
- Real-time uses `flask_socketio.SocketIO` configured with `message_queue=REDIS_URL` so Celery workers can emit events back to clients via the same Redis pub/sub. Async mode auto-selects: `gevent` if monkey-patched (prod via `wsgi.py`), else `threading`. Socket events are wired in `routes/sockets.py` via `register_socket_events(socketio)`.
- Database: `database.py` exposes `get_db_connection()` from a 20-connection PyMySQL pool (DBUtils). All routes/agents/services pull connections from this pool — there is no ORM. SQL lives inline in route handlers and agent modules.
- Auth: JWT via `flask_jwt_extended` with access/refresh tokens, plus a DB-backed token blocklist in `services/session_manager.py`. `load_blocklist_from_db()` is called at startup.
- Background work: `celery_app.py` defines three queues (`default`, `high_priority`, `periodic`) and a `beat_schedule` for engagement/wellness/knowledge/moderation/summarizer cron jobs. Tasks live in `tasks/agent_tasks.py` and `tasks/email_tasks.py`. Routing is explicit per-task — when adding a task, also add a `task_routes` entry or it lands on `default`.
- Configuration: `config.py` reads env from `.env` (loaded via `python-dotenv`). Required: `DB_*`, `JWT_SECRET_KEY` (enforced in prod), `REDIS_URL`, `GEMINI_API_KEY`. Optional: SMTP creds, VAPID keys for web push.

### AI Agents

Agents live in `Backend/agents/` (`summarizer`, `mood_tracker`, `moderation`, `wellness`, `engagement`, `knowledge_builder` / `knowledge_builder_v2`, `focus`). They are **lazy-loaded** via `agents/__init__.py`'s `__getattr__` so heavy ML deps (transformers, torch, spacy) don't load at process start — important for prod cold starts on Render where `wsgi.py` binds the port immediately and then heavy-imports.

Each agent is hybrid: tries Gemini (`google.genai` with `GEMINI_API_KEY`) first, falls back to rule-based / lexicon logic from `Backend/lexicons/` and `Backend/utils/ai/`. Agents have two dispatch entry points sharing the same agent modules: HTTP via `routes/agents.py` (the `agents_bp` blueprint, used by frontend buttons/panels) and Socket.IO slash commands like `/summarize` via `routes/sockets.py:handle_ai_command`. Scheduled invocations come from Celery tasks in `tasks/agent_tasks.py`.

Per-agent design specs are in `docs/` (`MODERATION_AGENT.md`, `KNOWLEDGE_BUILDER_AGENT.md`, etc.) — read these before changing agent behavior, especially `MODERATION_AGENT_V2_DESIGN.md` for the buffered/retroactive flow. `docs/AGENT_UNIFIED_INTEGRATION_PLAN.md` and `docs/AGENTS_USER_GUIDE.md` cover the in-flight unified agent UI/integration work.

### Frontend: context-heavy SPA

- `App.tsx` is the entire provider tree: `ThemeProvider` → `AuthProvider` → `RealtimeProvider` → `WorkspaceProvider` → `NotificationsProvider` → `FriendsProvider` → `DirectMessagesProvider` → `VoiceProvider` → `CallProvider` → `AIAgentProvider` → `AgentModalsProvider` → `MediaViewerProvider` → `BrowserRouter`. Order matters — providers later in the tree consume earlier ones. Add new global state by inserting another context here, not by lifting into `App`.
- Routing is split: a top-level `<Routes>` handles auth/admin/system-admin pages directly; the catch-all `/*` mounts `<AppRouter>` which gates on `useAuth()` (auth → onboarding → main app).
- Two distinct admin dashboards: `/admin/*` (community admin, scoped by `CommunityDashboardProvider`) and `/system-admin/*` (platform admin, separate login flow). Don't conflate them — they hit different backend blueprints (`community_admin_bp` vs `admin_bp`).
- Real-time: `services/socketService.ts` wraps `socket.io-client`. `RealtimeContext` owns the socket lifecycle and broadcasts events to feature contexts (Friends, DirectMessages, Notifications, AIAgent). When adding a server-emitted event, register the listener in the appropriate context, not in a leaf component.
- Pages are lazy-loaded via `React.lazy` — match this pattern when adding new top-level routes. Vite's `manualChunks` in `vite.config.ts` splits vendor bundles (react, ui, charts, realtime, utils).
- Path alias `@/` → `src/`. Imports from `@/components/...`, `@/services/...`, etc. are standard.

### Database migrations

SQL migrations live in `Backend/migrations/` as numbered/named `.sql` files plus a few Python migration scripts (`*.py`). There is no migration framework — files are applied manually. The canonical schema is `Backend/migrations/schema.sql`. When adding a column or table, add a new `add_*.sql` file and update `schema.sql`. The old root-level `Backend/schema.sql` has been removed — don't recreate it; `Backend/migrations/schema.sql` is the single source of truth.

## Conventions worth knowing

- Agent UI/integration is the active workstream — new agent modules (`assistant`, `auto_message`, `support`, `translator`), `knowledge_builder_v2`, moderation v2, and new frontend pieces (`AgentBar.tsx`, `AgentResultPanel.tsx`, `KnowledgePanel.tsx`, `QuickReplyChips.tsx`) are all in flight. Check `git status` and `docs/AGENT_UNIFIED_INTEGRATION_PLAN.md` for the current state rather than assuming the list here is exhaustive.
- `docs/PROJECT_CONTEXT.md` and `docs/Auraflow_context.md` give product context (this is a student/FYP communication platform with mood/wellness/moderation as core differentiators).
- Static uploads (avatars, community logos/banners) are served by the Flask app from `Backend/uploads/` via dedicated routes — Vite proxies `/uploads` to the backend in dev.
- Bash shell in this environment uses Unix syntax even though the OS is Windows — use forward slashes and `/dev/null`.
