"""Seed the showcase channel with a rich tech team conversation for KB demo."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pymysql
from pymysql.cursors import DictCursor
from config import DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
from datetime import datetime, timedelta

def get_direct_connection():
    """Bypass the PooledDB (maxusage=100 recycles mid-transaction) for bulk inserts."""
    return pymysql.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASSWORD, database=DB_NAME,
        port=3306, cursorclass=DictCursor, charset='utf8mb4', autocommit=False
    )

CHANNEL_ID = 17

# Users in Design Studio community
# ahmedkhan=1, fatimaz=4, hamzaali=5, ayeshakhan=6, usmanghani=9,
# hassanraza=11, shahzaib_dev=21, rimsha_ux=22, arslanmir=23, mehwishali=24

base = datetime(2026, 4, 20, 9, 0, 0)

def t(minutes):
    return base + timedelta(minutes=minutes)

messages = [
    # ── Day 1 Morning: React + TypeScript setup ──────────────────────────────
    (t(0),    21, "Hey team! Starting our new React + TypeScript project today. Wanted to discuss our tech stack and best practices before we dive in."),
    (t(2),     1, "Great idea shahzaib_dev. First question - should we use Vite or Create React App for our project setup?"),
    (t(4),    21, "Definitely Vite. CRA is deprecated and no longer maintained. Vite offers lightning-fast HMR, much faster cold starts, and native ES module support. Build times will be 10-20x faster compared to CRA."),
    (t(6),     5, "What is HMR exactly? I keep hearing about it but never fully understood it."),
    (t(8),    21, "HMR stands for Hot Module Replacement. It swaps, adds, or removes modules while the app is running without a full page reload. You keep your app state while editing code - huge productivity boost during development."),
    (t(10),   23, "Should we use JavaScript or TypeScript? Some of the team is new to TypeScript."),
    (t(12),    1, "We are going with TypeScript. The learning curve is worth it. TypeScript adds static type checking which catches bugs at compile time instead of runtime, gives better IDE autocomplete, and makes refactoring safer."),
    (t(14),    4, "What is the difference between type and interface in TypeScript? I always get confused."),
    (t(16),   21, "Great question fatimaz. Both define object shapes but: interface is better for defining object contracts and can be extended with extends. type is more flexible - can define unions, intersections, and primitives. Rule of thumb: use interface for objects, use type for unions and complex compositions."),
    (t(18),    6, "How do we handle state management? Redux or something lighter?"),
    (t(20),    1, "We decided to use Zustand for global state management. Redux is overkill for most projects. Zustand is minimal with no boilerplate, supports TypeScript out of the box. For server state like API data, we will use TanStack Query (React Query)."),
    (t(22),    9, "What is TanStack Query and why use it instead of useEffect plus useState for API calls?"),
    (t(25),    1, "TanStack Query is a server state management library. Unlike useEffect plus useState, it gives you automatic caching, background refetching, loading/error states, pagination, and infinite scroll out of the box. It eliminates 90 percent of boilerplate for API data fetching and handles race conditions automatically."),
    (t(28),   11, "How should we structure our folder structure for the project?"),
    (t(32),   21, "We are using feature-based folder structure: src/features/ for each feature module, src/components/ for shared UI components, src/hooks/ for custom hooks, src/services/ for API layer, src/stores/ for Zustand stores, src/types/ for shared TypeScript types."),
    (t(35),   24, "What is the difference between useMemo and useCallback in React?"),
    (t(38),   21, "useMemo memoizes the result of a computation - use it to avoid re-computing expensive values on every render. useCallback memoizes a function reference - use it when passing callbacks to child components wrapped in React.memo to prevent unnecessary re-renders. Only use these when you have a measurable performance problem."),
    (t(42),    5, "Should we use CSS Modules, Tailwind, or styled-components?"),
    (t(45),   22, "We decided on Tailwind CSS. Utility-first classes means you write styles directly in JSX with no context switching. It produces smaller CSS bundles than CSS-in-JS libraries, has excellent VSCode IntelliSense support, and pairs well with shadcn/ui. The team already has experience with it."),

    # ── Day 1 Afternoon: API Design ──────────────────────────────────────────
    (t(120),   1, "Moving on to API design. What REST conventions are we following?"),
    (t(122),  21, "We follow these REST conventions: GET for reading, POST for creating, PUT for full updates, PATCH for partial updates, DELETE for removing. URLs use nouns not verbs - /api/users not /api/getUsers. Use plural nouns. Always version the API - /api/v1/users. Return proper HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found, 500 Server Error."),
    (t(126),   4, "What is the difference between 401 and 403 HTTP status codes? I always mix them up."),
    (t(128),  21, "401 Unauthorized means the user is not authenticated - they need to log in first. 403 Forbidden means the user IS authenticated but does not have permission to access that resource. Think of it as: 401 is who are you, and 403 is I know who you are but you cannot come in here."),
    (t(130),   9, "How are we handling API authentication? JWT or sessions?"),
    (t(133),   1, "We are using JWT with refresh token rotation. The access token expires in 15 minutes. The refresh token expires in 7 days and is stored in an httpOnly cookie for security. When the access token expires, the client uses the refresh token to get a new one silently."),
    (t(136),  23, "What is an httpOnly cookie and why is it more secure?"),
    (t(139),   1, "An httpOnly cookie cannot be accessed via JavaScript document.cookie - only the browser can read and send it with requests. This protects against XSS attacks where malicious scripts try to steal tokens. If you store a JWT in localStorage, any JavaScript on the page can steal it. httpOnly cookies prevent this entirely."),
    (t(142),  11, "How should we handle API errors on the frontend?"),
    (t(145),  21, "We are implementing a global API error interceptor using axios interceptors. It handles 401 by redirecting to login and clearing stored tokens. 403 shows a permission denied message. 500 shows a generic server error toast. Individual components only handle business logic errors specific to their feature - not generic HTTP errors."),

    # ── Day 2 Morning: Design System ─────────────────────────────────────────
    (t(1440), 22, "Good morning! Ready to talk about our design system today?"),
    (t(1442),  6, "Yes! What component library are we using?"),
    (t(1444), 22, "We decided to use shadcn/ui as our component foundation. It is not a traditional component library - you copy the component source code directly into your project which means full customisation control. Built on Radix UI primitives for accessibility and Tailwind for styling."),
    (t(1447),  5, "What is Radix UI? How is it different from Material UI or Ant Design?"),
    (t(1450), 22, "Radix UI provides headless, accessible UI primitives - they have all the interaction logic, keyboard navigation, ARIA attributes, and focus management built in, but zero styling. Material UI and Ant Design come with opinionated visual styling you have to override. Radix gives full design freedom while keeping accessibility correct by default."),
    (t(1453), 24, "How are we handling responsive design? Mobile-first or desktop-first?"),
    (t(1456), 22, "Mobile-first always. In Tailwind base styles are for mobile and you add sm: md: lg: xl: breakpoints for larger screens. Our breakpoints: sm=640px for large phones, md=768px tablet, lg=1024px small laptop, xl=1280px desktop. Mobile-first results in better performance on mobile devices."),
    (t(1460),  4, "What typography scale are we using?"),
    (t(1463), 22, "We use a modular type scale based on a 1.25 ratio. Base font size is 16px. The scale: text-xs=12px, text-sm=14px, text-base=16px, text-lg=18px, text-xl=20px, text-2xl=24px, text-3xl=30px. Body text uses Inter for readability. Headings use a heavier weight of the same font for consistency."),
    (t(1466),  9, "What color system are we using?"),
    (t(1469), 22, "HSL color system with CSS custom properties for theming. We have semantic color tokens: --color-primary for brand actions, --color-destructive for errors and delete actions, --color-muted for secondary text and backgrounds, --color-accent for highlights. Dark mode just swaps the CSS variables."),
    (t(1472),  1, "We have decided on 8px spacing grid as our base unit. All margins, padding, and gaps should be multiples of 8px. Allowed values: 4px half unit use sparingly, 8px, 16px, 24px, 32px, 48px, 64px, 96px, 128px."),
    (t(1475), 23, "What is the rule for when to use a component vs just writing inline Tailwind?"),
    (t(1478), 22, "The rule: if you use a UI pattern more than twice, extract it into a component. If it has interactive state like hover, focus, active, disabled, make it a component. If it contains business logic, definitely a component. Simple layout one-offs can stay as inline Tailwind."),

    # ── Day 2 Afternoon: Performance ─────────────────────────────────────────
    (t(1560), 21, "Lets talk performance. What are our core web vitals targets?"),
    (t(1562),  1, "We are targeting: LCP (Largest Contentful Paint) under 2.5 seconds for main content loading speed. FID (First Input Delay) under 100ms for responsiveness to first user interaction. CLS (Cumulative Layout Shift) under 0.1 for visual stability. INP (Interaction to Next Paint) under 200ms for overall interaction responsiveness."),
    (t(1565),  5, "What is lazy loading and how do we implement it in React?"),
    (t(1568), 21, "Lazy loading defers loading of non-critical resources until they are needed. In React, use React.lazy() combined with Suspense to code-split routes and large components. This creates a separate JS bundle that only downloads when the user navigates to that route, reducing initial bundle size significantly."),
    (t(1571),  9, "How do we handle image optimisation?"),
    (t(1574), 22, "For images: always specify width and height to prevent CLS. Use WebP format - 25 to 35 percent smaller than PNG/JPEG with same quality. Use loading lazy for below-the-fold images. Compress all images before upload using TinyPNG or Squoosh. Avoid images wider than 1920px for any use case."),
    (t(1578),  4, "What causes layout shift and how do we prevent it?"),
    (t(1581), 22, "Layout shift is caused by: images without dimensions, dynamically injected content above existing content, web fonts loading and changing text size, embeds loading async. Prevent it by always reserving space for dynamic content with min-height or skeleton screens before data loads."),
    (t(1585), 11, "We decided that all data-fetching components must show skeleton loaders while loading, not just a spinner. Skeletons reduce perceived load time and prevent layout shift. Use the same dimensions as the actual content that will replace them."),

    # ── Day 3 Morning: Testing Strategy ──────────────────────────────────────
    (t(2880),  1, "Day 3 - lets define our testing strategy. What testing framework are we using?"),
    (t(2882), 21, "We are using Vitest for unit tests (Vite-native, much faster than Jest), React Testing Library for component tests, and Playwright for end-to-end tests. The testing pyramid: lots of unit tests for pure functions, fewer component tests for UI behaviour, minimal E2E tests for critical user flows only."),
    (t(2885), 23, "What is the difference between unit tests, integration tests, and E2E tests?"),
    (t(2888), 21, "Unit tests test a single function or component in isolation with mocked dependencies - fast and cheap. Integration tests test multiple units working together - catch interface bugs. E2E tests run the full app in a real browser simulating real user actions - slow but catch real-world issues. Test at the lowest level that gives you confidence."),
    (t(2892),  6, "What should we actually test vs what can we skip?"),
    (t(2895),  1, "Always test: business logic functions, data transformations, custom hooks, API error handling, anything with conditional logic. Do not test: implementation details, third-party library code, simple presentational components with no logic. A good test verifies behaviour from the users perspective not how the code works internally."),
    (t(2899),  5, "What is a mock and when should we use it?"),
    (t(2902), 21, "A mock is a fake replacement for a real dependency like an API call or database so your test runs in isolation without real side effects. Use mocks for: external API calls, database operations, browser APIs like localStorage, timers. Do not mock things you own - if you mock your own code you are not testing real integration."),
    (t(2906), 24, "How do we write tests for async operations?"),
    (t(2909), 21, "In Vitest use async/await with waitFor from Testing Library. Always test all three async states: loading state, success state with data, and error state. Use vi.mock() to mock fetch calls and return controlled responses. Never use arbitrary setTimeout in tests - use fake timers instead."),

    # ── Day 3 Afternoon: Git + Deployment ────────────────────────────────────
    (t(2980),  1, "Lets finalise our git workflow and deployment setup."),
    (t(2982), 21, "We are using Git Flow with main, develop, feature, hotfix, and release branches. main is always production-ready. develop is the integration branch. Feature branches named feature/ticket-description are merged into develop via pull request. Releases are tagged in main. Hotfixes branch from main directly."),
    (t(2985), 23, "What is a pull request and why do we require them?"),
    (t(2987),  1, "A pull request is a request to merge code from one branch to another. It gives teammates the chance to review your code for bugs, style issues, and knowledge sharing before it goes into the main codebase. We require at least one approval before merging. Every PR must have a description, link to the issue, and screenshots for UI changes."),
    (t(2990),  9, "What is CI/CD and how are we setting it up?"),
    (t(2993), 21, "CI/CD stands for Continuous Integration and Continuous Deployment. CI means every push automatically runs tests and linting to catch problems early. CD means passing code is automatically deployed to staging or production. We are using GitHub Actions for CI - runs on every PR: ESLint, TypeScript check, unit tests, build. Deployment to Vercel for frontend and Render for backend happens automatically on merge to main."),
    (t(2997), 11, "What is ESLint and why is it mandatory?"),
    (t(3000), 21, "ESLint is a static code analysis tool that enforces code quality rules. It catches common bugs like unused variables, potential null reference errors, and incorrect React hook usage before runtime. We have decided ESLint errors block the CI pipeline - code that does not pass lint cannot be merged."),
    (t(3004),  4, "What environment variables do we need and how do we manage them safely?"),
    (t(3007),  1, "Environment variables store configuration that changes per environment and secrets that should not be in source code. Use .env files locally - never commit these to git. The .env.example file lists all required variables with placeholder values and IS committed. Production secrets are stored in the hosting platform environment settings, never in the code."),

    # ── Day 4: Database + Backend ─────────────────────────────────────────────
    (t(4320),  1, "Backend architecture day. How are we handling database connections?"),
    (t(4323), 21, "We are using connection pooling with PyMySQL. Connection pooling maintains a pool of pre-opened database connections that are reused for requests instead of opening and closing a new connection for every query. This dramatically reduces latency and prevents database connection exhaustion under load. Max pool size is 20 connections for production."),
    (t(4326), 23, "What is database indexing and when should we add indexes?"),
    (t(4329),  1, "A database index is a data structure that speeds up SELECT queries at the cost of slower INSERT/UPDATE/DELETE and more storage. Add indexes on: foreign key columns used in JOINs, columns used in WHERE clauses with high cardinality, columns used in ORDER BY when sorting large tables. Use EXPLAIN to check if queries are using indexes."),
    (t(4332),  5, "What is the N+1 query problem?"),
    (t(4335),  1, "The N+1 problem is when code executes 1 query to get a list of N items, then N additional queries to get related data for each item - resulting in N+1 total queries. Example: fetch 100 posts then fetch the author for each post equals 101 queries total. Solution: use JOIN to fetch related data in a single query, or use eager loading to batch the related queries into one."),
    (t(4338),  9, "What is SQL injection and how do we prevent it?"),
    (t(4341),  1, "SQL injection is when user input is directly inserted into SQL strings, allowing attackers to run arbitrary SQL commands. Prevention: always use parameterised queries or prepared statements with placeholders. Our database layer already enforces this - never use string concatenation to build SQL queries."),
    (t(4344), 24, "What is database normalisation?"),
    (t(4347),  1, "Normalisation is the process of organising database tables to reduce data redundancy and improve integrity. First Normal Form 1NF: each cell holds one value. Second Normal Form 2NF: no partial dependencies on composite keys. Third Normal Form 3NF: no transitive dependencies. We target 3NF for our schema. Denormalise only when there is a proven performance requirement."),
    (t(4350), 11, "How are we handling database migrations?"),
    (t(4353), 21, "We use Flask-Migrate (Alembic) for database migrations. Every schema change is a migration file tracked in version control. Never alter the production database manually - always through migrations. Migrations must be reversible. Run migrations in staging first and verify before production. The migration history is the source of truth for schema evolution."),

    # ── Day 5: Security Best Practices ───────────────────────────────────────
    (t(5760),  1, "Security review day. What are the OWASP Top 10 risks we need to know?"),
    (t(5763), 21, "OWASP Top 10 are the most critical web security risks. Top ones relevant to us: Broken Access Control - always verify permissions server-side, never trust client. Cryptographic Failures - use bcrypt for passwords, never MD5 or SHA1. Injection - parameterised queries always. Security Misconfiguration - disable debug mode in production, no default passwords."),
    (t(5767),  4, "How do we securely store passwords?"),
    (t(5770),  1, "Never store plain text or reversibly encrypted passwords. Use bcrypt with a work factor of at least 12. bcrypt automatically handles salting (adding random data before hashing to prevent rainbow table attacks) and the work factor controls how slow the hash is, making brute force impractical. We use werkzeug.security.generate_password_hash and check_password_hash which use bcrypt internally."),
    (t(5773), 22, "What is CORS and why do we need to configure it?"),
    (t(5776), 21, "CORS is Cross-Origin Resource Sharing, a browser security policy that blocks JavaScript on one domain from making requests to a different domain. Our React frontend on localhost:5173 calling Flask API on localhost:5000 is cross-origin. We must configure Flask-CORS to allow our specific frontend origins. Never use wildcard star in production - always specify exact allowed origins."),
    (t(5779),  9, "What is rate limiting and should we implement it?"),
    (t(5782),  1, "Rate limiting restricts how many requests a client can make in a time window. We have decided to implement rate limiting on all authentication endpoints - max 5 attempts per 15 minutes per IP. This prevents brute force attacks. For general API endpoints: 100 requests per minute per user. We are using Flask-Limiter. Return 429 Too Many Requests when limit is exceeded."),
    (t(5785), 23, "What is input validation and where do we do it?"),
    (t(5788),  1, "Input validation verifies that data meets expected format, type, range, and length before processing. We validate at two layers: frontend for immediate UX feedback and backend for security enforcement - never trust client input. Backend validation is mandatory. Use Pydantic or marshmallow for schema validation in Flask. Reject unexpected fields, sanitise strings, enforce max lengths, validate email formats."),

    # ── Day 6: Team Agreements ────────────────────────────────────────────────
    (t(7200),  1, "Final day - lets record our team agreements and coding standards."),
    (t(7202), 21, "Code review agreement: reviews must be completed within 24 hours. Be constructive - suggest, do not demand. Distinguish blocking issues from nit-picks using Blocking: or Nit: prefix. Approve if code is good enough even if you would do it differently. The author has final say on non-blocking feedback."),
    (t(7205), 22, "Design handoff agreement: all designs delivered in Figma with component variants, spacing annotations, and interaction notes. Developers should ask designers before deviating from specs. Design tokens for colors, typography, and spacing are maintained in the Figma design system file and are the source of truth."),
    (t(7208),  4, "We agreed that all API endpoints must be documented in the README with request and response examples before merging. No undocumented endpoints."),
    (t(7211),  9, "Performance budget agreement: no PR increases bundle size by more than 5KB without team discussion. Use webpack-bundle-analyzer to check. Images must be compressed before committing."),
    (t(7214),  5, "We agreed that all TODO comments in code must have a linked GitHub issue number. No orphan TODOs. Format: TODO #123 description of what needs to be done."),
    (t(7217), 11, "Meeting cadence decided: daily 15-minute standup at 10am, weekly planning on Monday, retrospective every two weeks. Standups follow format: what I did yesterday, what I am doing today, any blockers."),
    (t(7220), 24, "Accessibility agreement: all interactive elements must be keyboard navigable. All images need alt text. Colour contrast ratio must meet WCAG AA standard (4.5:1 for normal text). Screen reader testing on all major features before release."),
    (t(7223), 23, "We decided to use conventional commits format for all commit messages. Format: type(scope): description. Types: feat (new feature), fix (bug fix), docs (documentation), style (formatting), refactor (code restructure), test (tests), chore (maintenance). Example: feat(auth): add refresh token rotation."),
    (t(7226),  1, "Final decision: the tech stack is officially Vite + React 18 + TypeScript, Tailwind CSS + shadcn/ui, Zustand + TanStack Query, Vitest + Playwright, Flask + PyMySQL on the backend, deployed on Vercel for frontend and Render for backend. This is locked in for the v1 release."),
    (t(7228), 21, "Agreed. Lets build something great!"),
    (t(7230), 22, "Excited to kick this off properly with such a solid foundation!"),
    (t(7232),  9, "All documented. Let us get started!"),
]

conn = get_direct_connection()
cur = conn.cursor()

# Clear existing messages and KB entries
cur.execute("DELETE FROM knowledge_base WHERE related_channel = %s", (CHANNEL_ID,))
cur.execute("DELETE FROM messages WHERE channel_id = %s", (CHANNEL_ID,))
conn.commit()
print(f"Cleared existing messages and KB entries for channel {CHANNEL_ID}")

# Insert all messages
for ts, uid, content in messages:
    cur.execute(
        "INSERT INTO messages (channel_id, sender_id, content, message_type, created_at) VALUES (%s, %s, %s, %s, %s)",
        (CHANNEL_ID, uid, content, "text", ts)
    )

conn.commit()
conn.close()
print(f"Done! Inserted {len(messages)} messages spanning {messages[0][0].date()} to {messages[-1][0].date()}")
