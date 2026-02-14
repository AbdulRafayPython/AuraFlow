"""
seed_database.py — Populate AuraFlow with 50 users, communities, friends, and conversations.

USAGE:
  cd Backend
  python scripts/seed_database.py

WARNING: This WIPES all existing data and starts fresh.
"""

import sys, os, random, uuid
from datetime import datetime, timedelta

# Add parent dir so we can import config/database
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import bcrypt
from database import get_db_connection

# ─── CONFIG ────────────────────────────────────────────────────────────
PASSWORD = "Test@1234"  # All seed users share this password
HASHED_PW = bcrypt.hashpw(PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

# ─── 50 REALISTIC USERS ───────────────────────────────────────────────
USERS = [
    ("ahmedkhan",      "Ahmed Khan",       "ahmed.k@gmail.com"),
    ("sarahdev",       "Sarah Developer",  "sarah.dev@outlook.com"),
    ("alirazadev",     "Ali Raza",         "ali.raza@gmail.com"),
    ("fatimaz",        "Fatima Zahra",     "fatima.z@yahoo.com"),
    ("hamzaali",       "Hamza Ali",        "hamza.ali@gmail.com"),
    ("ayeshakhan",     "Ayesha Khan",      "ayesha.k@hotmail.com"),
    ("bilalahmed",     "Bilal Ahmed",      "bilal.ahmed@gmail.com"),
    ("mariam_dev",     "Mariam Siddiqui",  "mariam.s@outlook.com"),
    ("usmanghani",     "Usman Ghani",      "usman.g@gmail.com"),
    ("zainab_code",    "Zainab Malik",     "zainab.m@gmail.com"),
    ("hassanraza",     "Hassan Raza",      "hassan.r@yahoo.com"),
    ("noormehak",      "Noor Mehak",       "noor.mehak@gmail.com"),
    ("daniyalshah",    "Daniyal Shah",     "daniyal.s@outlook.com"),
    ("hiramustafa",    "Hira Mustafa",     "hira.m@gmail.com"),
    ("owaisqureshi",   "Owais Qureshi",   "owais.q@gmail.com"),
    ("sanarehman",     "Sana Rehman",      "sana.r@yahoo.com"),
    ("taboraali",      "Tabora Ali",       "tabora.a@gmail.com"),
    ("mahirahkhan",    "Mahirah Khan",     "mahirah.k@hotmail.com"),
    ("faborafaiz",     "Faraz Faiz",       "faraz.f@gmail.com"),
    ("nimrakashif",    "Nimra Kashif",     "nimra.k@outlook.com"),
    ("shahzaib_dev",   "Shahzaib Amir",   "shahzaib.a@gmail.com"),
    ("rimsha_ux",      "Rimsha Nawaz",     "rimsha.n@gmail.com"),
    ("arslanmir",      "Arslan Mir",       "arslan.m@yahoo.com"),
    ("mehwishali",     "Mehwish Ali",      "mehwish.a@gmail.com"),
    ("abdullahz",      "Abdullah Zafar",   "abdullah.z@outlook.com"),
    ("komalshah",      "Komal Shah",       "komal.s@gmail.com"),
    ("furqanali",      "Furqan Ali",       "furqan.a@gmail.com"),
    ("iqranoor",       "Iqra Noor",        "iqra.n@hotmail.com"),
    ("kamrandev",      "Kamran Ahmad",     "kamran.a@gmail.com"),
    ("bushra_ml",      "Bushra Tariq",     "bushra.t@outlook.com"),
    ("waqasali",       "Waqas Ali",        "waqas.a@gmail.com"),
    ("sumayya_ds",     "Sumayya Farooq",   "sumayya.f@gmail.com"),
    ("tayyabh",        "Tayyab Hussain",   "tayyab.h@yahoo.com"),
    ("laiba_code",     "Laiba Anwar",      "laiba.a@gmail.com"),
    ("faisalshah",     "Faisal Shah",      "faisal.s@outlook.com"),
    ("amnaiqbal",      "Amna Iqbal",       "amna.i@gmail.com"),
    ("moizrashid",     "Moiz Rashid",      "moiz.r@gmail.com"),
    ("misbahawan",     "Misbah Awan",      "misbah.a@hotmail.com"),
    ("rayyan_dev",     "Rayyan Ahmed",     "rayyan.a@gmail.com"),
    ("kinzaamir",      "Kinza Amir",       "kinza.a@outlook.com"),
    ("junaid_ops",     "Junaid Javed",     "junaid.j@gmail.com"),
    ("naimalee",       "Naima Lee",        "naima.l@gmail.com"),
    ("zaiddurrani",    "Zaid Durrani",     "zaid.d@yahoo.com"),
    ("aneeqa_pm",      "Aneeqa Riaz",      "aneeqa.r@gmail.com"),
    ("shaheerali",     "Shaheer Ali",      "shaheer.a@outlook.com"),
    ("palwashak",      "Palwasha Khan",    "palwasha.k@gmail.com"),
    ("talhashakir",    "Talha Shakir",     "talha.s@gmail.com"),
    ("maham_fe",       "Maham Farooqi",    "maham.f@hotmail.com"),
    ("hammadhasan",    "Hammad Hasan",     "hammad.h@gmail.com"),
    ("alizehqazi",     "Alizeh Qazi",      "alizeh.q@gmail.com"),
]

# ─── COMMUNITIES ───────────────────────────────────────────────────────
COMMUNITIES = [
    {
        "name": "Web Dev Hub",
        "description": "A community for frontend and backend web developers. Share projects, ask questions, and collaborate on modern web technologies.",
        "icon": "🌐",
        "color": "#3B82F6",
        "logo_url": "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "General web dev discussion"),
            ("frontend", "text", "React, Vue, Angular, and more"),
            ("backend", "text", "Node, Python, Go backend talk"),
            ("code-review", "text", "Share code for peer review"),
            ("voice-lounge", "voice", "Casual voice hangout"),
        ],
    },
    {
        "name": "AI & Machine Learning",
        "description": "Explore artificial intelligence, deep learning, NLP, and computer vision. From beginners to researchers.",
        "icon": "🤖",
        "color": "#8B5CF6",
        "logo_url": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "AI news and discussion"),
            ("papers", "text", "Latest research papers"),
            ("projects", "text", "Share your ML projects"),
            ("datasets", "text", "Dataset sharing and discussion"),
            ("study-room", "voice", "Group study sessions"),
        ],
    },
    {
        "name": "Gamers United",
        "description": "Join fellow gamers for discussions about the latest titles, competitive play, and casual gaming sessions.",
        "icon": "🎮",
        "color": "#EF4444",
        "logo_url": "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "Gaming talk"),
            ("valorant", "text", "Valorant strategies and clips"),
            ("minecraft", "text", "Minecraft builds and servers"),
            ("game-deals", "text", "Sales and free games"),
            ("gaming-voice", "voice", "Squad up!"),
        ],
    },
    {
        "name": "Design Studio",
        "description": "UI/UX designers, graphic artists, and creative minds. Share your work, get feedback, and grow together.",
        "icon": "🎨",
        "color": "#EC4899",
        "logo_url": "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1558655146-9f40138edfeb?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "Design community chat"),
            ("showcase", "text", "Show off your designs"),
            ("figma-tips", "text", "Figma tricks and templates"),
            ("ux-research", "text", "User experience discussions"),
            ("design-voice", "voice", "Live design critiques"),
        ],
    },
    {
        "name": "Startup Founders",
        "description": "Network with entrepreneurs, share startup ideas, discuss funding, and learn from each other's journeys.",
        "icon": "🚀",
        "color": "#F59E0B",
        "logo_url": "https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "Startup discussion"),
            ("ideas", "text", "Pitch your startup ideas"),
            ("funding", "text", "Investment and fundraising"),
            ("marketing", "text", "Growth hacking and marketing"),
            ("pitch-room", "voice", "Practice your pitch"),
        ],
    },
    {
        "name": "Study Buddies",
        "description": "Students helping students. CS, engineering, and science study groups. Exam prep and assignment help.",
        "icon": "📚",
        "color": "#10B981",
        "logo_url": "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1523050854058-8df90110c476?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "General study chat"),
            ("cs-help", "text", "Computer science help"),
            ("math", "text", "Mathematics discussion"),
            ("exam-prep", "text", "Exam preparation tips"),
            ("study-voice", "voice", "Study together live"),
        ],
    },
    {
        "name": "Music Lounge",
        "description": "Music lovers unite! Share tracks, discuss genres, learn instruments, and jam together.",
        "icon": "🎵",
        "color": "#6366F1",
        "logo_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "Music discussions"),
            ("recommendations", "text", "Share music recommendations"),
            ("production", "text", "Music production talk"),
            ("listening-party", "voice", "Listen together"),
        ],
    },
    {
        "name": "DevOps & Cloud",
        "description": "Docker, Kubernetes, AWS, Azure, CI/CD pipelines. Infrastructure as code and cloud architecture.",
        "icon": "☁️",
        "color": "#0EA5E9",
        "logo_url": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=200&h=200&fit=crop",
        "banner_url": "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&h=400&fit=crop",
        "channels": [
            ("general", "text", "DevOps discussion"),
            ("docker", "text", "Docker and containers"),
            ("kubernetes", "text", "K8s orchestration"),
            ("cicd", "text", "CI/CD pipeline tips"),
            ("ops-voice", "voice", "Live troubleshooting"),
        ],
    },
]

# ─── CONVERSATION TEMPLATES ────────────────────────────────────────────
# Realistic chat messages per community channel
CHANNEL_MESSAGES = {
    "Web Dev Hub": {
        "general": [
            "Hey everyone! Just joined 👋",
            "Welcome! What stack are you working with?",
            "Been using React + Express lately, really enjoying it",
            "Anyone tried Bun.js? It's blazing fast",
            "I switched from CRA to Vite and the DX is incredible",
            "What's everyone's go-to CSS framework?",
            "Tailwind all the way! Once you learn it, you can't go back",
            "I still prefer styled-components for complex theming",
            "Just deployed my first app to Vercel, super smooth",
            "Has anyone here worked with tRPC? Thinking of trying it",
            "tRPC is great if you're full-stack TypeScript",
            "Hot take: SSR is overhyped for most apps 🔥",
            "Disagree! SEO matters and SSR helps a lot",
            "For dashboard apps tho, CSR is perfectly fine",
            "Anyone going to the Next.js conf?",
        ],
        "frontend": [
            "What's the best state management for React in 2026?",
            "Zustand is lightweight and amazing",
            "I still use Redux Toolkit, it's mature and well-documented",
            "Jotai and Recoil are interesting for atomic state",
            "Has anyone migrated from class components to hooks?",
            "Hooks make everything so much cleaner honestly",
            "Pro tip: useMemo and useCallback are overused. Profile first!",
            "Just built a custom hook for infinite scroll, works great",
            "React Server Components are a game changer",
            "Struggling with hydration errors in Next.js, any tips?",
        ],
        "backend": [
            "Flask vs FastAPI for a new project?",
            "FastAPI is faster and has automatic OpenAPI docs",
            "Flask is simpler for small projects though",
            "I'm using NestJS with TypeORM, very productive",
            "Don't forget about Prisma! Best ORM experience ever",
            "Just set up rate limiting with Redis, works perfectly",
            "How do you all handle file uploads? Multer or S3 direct?",
            "S3 presigned URLs for direct upload, saves server bandwidth",
        ],
    },
    "AI & Machine Learning": {
        "general": [
            "Anyone following the latest GPT developments?",
            "The progress in multimodal AI is insane this year",
            "Just finished Andrew Ng's deep learning course, highly recommend",
            "Working on a sentiment analysis project for my thesis",
            "What frameworks are you all using? PyTorch or TensorFlow?",
            "PyTorch for research, TensorFlow for production deployment",
            "Has anyone tried fine-tuning LLaMA models?",
            "RAG is the way to go for domain-specific applications",
            "Just published my first paper on transformer architectures!",
            "Congrats! 🎉 What was it about?",
            "Efficient attention mechanisms for long sequences",
            "That's awesome, would love to read it",
        ],
        "papers": [
            "This new paper on diffusion models is incredible",
            "Link? I'd love to check it out",
            "Anyone read the latest survey on LLM hallucination mitigation?",
            "The Mixture of Experts approach is really promising",
            "Constitutional AI paper by Anthropic is worth reading",
        ],
        "projects": [
            "Building a chatbot for customer support using RAG",
            "What vector database are you using?",
            "Pinecone for production, Chroma for local dev",
            "Just deployed an image classifier for a medical imaging startup",
            "Working on a speech-to-text system for Urdu language",
            "That's really needed! How's the accuracy?",
            "Around 87% WER, still improving the dataset",
        ],
    },
    "Gamers United": {
        "general": [
            "What's everyone playing this weekend?",
            "Still grinding Elden Ring DLC 😭",
            "Tried the new Valorant agent? Pretty broken ngl",
            "GTA 6 hype is REAL 🔥🔥🔥",
            "Anyone want to squad up for Apex?",
            "I'm down! My username is blazerunner42",
            "Just built a new PC, RTX 5090 is a beast",
            "Steam sale is live! Already spent too much lol",
            "The Witcher 4 trailer gave me chills",
            "Nintendo going hard with their new console too",
        ],
        "valorant": [
            "How do you counter Jett on Ascent?",
            "Cypher setups are key, learn lineups",
            "Just hit Diamond! So hyped 💎",
            "Congrats! I'm hard stuck Plat 3 😅",
            "Duelist instalockers are the bane of ranked",
            "Just play smokes, free RR if you're decent",
            "The new map is actually really well designed",
        ],
        "minecraft": [
            "Anyone want to join my survival server?",
            "Drop the IP! I'm in 🎮",
            "Just finished a massive castle build, took 3 weeks",
            "Redstone engineering is basically programming lol",
            "Modded or vanilla? I need Optifine at minimum",
        ],
    },
    "Design Studio": {
        "general": [
            "What's trending in UI design right now?",
            "Glassmorphism is still going strong",
            "Bento grid layouts are everywhere on portfolios",
            "Minimalism never goes out of style honestly",
            "Anyone use Framer for portfolio sites?",
            "Framer is incredible, no code needed for simple sites",
            "Typography makes or breaks a design, change my mind",
            "Totally agree! I spend hours choosing fonts",
        ],
        "showcase": [
            "Just finished a dashboard redesign, thoughts? 🎨",
            "Looks clean! Love the color palette",
            "The spacing is perfect, very consistent 8px grid",
            "Here's my latest mobile app design concept",
            "That onboarding flow is really smooth!",
            "How long did this take you?",
            "About 2 weeks from wireframe to high-fidelity",
        ],
    },
    "Startup Founders": {
        "general": [
            "Just quit my job to work on my startup full-time 🚀",
            "Bold move! What are you building?",
            "An AI-powered project management tool for remote teams",
            "The market is crowded but there's always room for differentiation",
            "Focus on one killer feature and nail it",
            "How are you handling initial funding?",
            "Bootstrapping for now, will seek seed round in 6 months",
            "YC applications are open, definitely apply!",
            "Customer discovery is the most underrated phase",
            "100%! Talk to 50 potential users before writing code",
        ],
        "ideas": [
            "Idea: AI tutoring platform for competitive exam prep",
            "That could work! MCAT/LSAT prep is a huge market",
            "Idea: sustainable packaging marketplace for small businesses",
            "Love it, sustainability is a growing priority",
            "How about a platform connecting freelance developers with startups?",
            "Upwork exists but something more niche could work",
        ],
    },
    "Study Buddies": {
        "general": [
            "Finals week is killing me 😫",
            "We got this! One exam at a time 💪",
            "Anyone up for a study session tonight?",
            "I'm in! Need to review data structures",
            "Pro tip: teach the concept to someone else, best way to learn",
            "Pomodoro technique saved my grades honestly",
            "25 min focus, 5 min break, repeat!",
            "Where do you all find good study resources?",
            "MIT OpenCourseWare is gold for CS courses",
            "Khan Academy for math fundamentals",
        ],
        "cs-help": [
            "Can someone explain Big O notation simply?",
            "It tells you how your algorithm's time grows with input size",
            "O(n) = linear, O(n²) = quadratic, O(log n) = logarithmic",
            "Think of it as: how many steps does your code take as n gets huge?",
            "Struggling with dynamic programming, any good resources?",
            "Start with the classic problems: fibonacci, knapsack, coin change",
            "Break it into subproblems, find the recurrence relation",
            "LeetCode has a great DP study plan",
        ],
    },
    "Music Lounge": {
        "general": [
            "What genre is everyone into?",
            "Lo-fi beats for coding sessions 🎧",
            "Rock and metal for workouts 🤘",
            "Coke Studio Pakistan has some absolute bangers",
            "Anyone else listen to Atif Aslam's new album?",
            "His voice is just on another level",
            "Drop your Spotify playlists! Need new music",
            "Classical music for deep focus, trust me",
        ],
        "recommendations": [
            "If you like The Weeknd, check out Daniel Caesar",
            "Daft Punk's Random Access Memories is a masterpiece",
            "For study music: Tycho, Bonobo, Khruangbin",
            "Nusrat Fateh Ali Khan is timeless 🙏",
            "Anyone into K-pop? NewJeans is great",
        ],
    },
    "DevOps & Cloud": {
        "general": [
            "Just got my AWS Solutions Architect cert! 🎉",
            "Congrats! That's a tough one. How long did you study?",
            "About 3 months, used Stephane Maarek's course",
            "Docker Compose vs Kubernetes for small projects?",
            "Docker Compose for dev, K8s only when you actually need scale",
            "Terraform or CloudFormation?",
            "Terraform all day, multi-cloud support is key",
            "Just set up GitHub Actions for our CI/CD, so much better than Jenkins",
        ],
        "docker": [
            "Multi-stage builds reduced our image from 1.2GB to 180MB 😱",
            "Always use .dockerignore, people forget about it",
            "Best practices: non-root user, specific base image tags, health checks",
            "Docker Desktop license changes pushed us to Podman",
            "Distroless images are great for security",
        ],
    },
}

# ─── DM CONVERSATION TEMPLATES ────────────────────────────────────────
DM_CONVERSATIONS = [
    [
        ("Hey! Saw you in the Web Dev Hub, your React project looks awesome!",),
        ("Thanks! I've been working on it for a month. Are you into React too?",),
        ("Yeah, just started with Next.js actually. Any tips?",),
        ("Start with the app router, it's the future. And learn Server Components early",),
        ("Appreciate it! Will do 💪",),
    ],
    [
        ("Yo, wanna team up for the hackathon?",),
        ("Which one? The MLH one?",),
        ("Yeah! I can handle frontend, need a backend person",),
        ("I'm in! I'll set up the Flask API and database",),
        ("Perfect, let's create a Discord for planning",),
        ("Already on AuraFlow 😄 let's just use DMs here",),
    ],
    [
        ("Bro that was such a clutch play in Valorant today 🔥",),
        ("Haha thanks! That ace on Haven was pure luck though",),
        ("Luck? You tapped all 5 through smokes!",),
        ("Okay maybe a little skill 😂",),
        ("Let's run it back tomorrow, same time?",),
        ("Down! Bring your A game",),
    ],
    [
        ("Hey, can you help me with my DSA assignment?",),
        ("Sure! What topic?",),
        ("Binary search trees. I don't get rotations in AVL trees",),
        ("The key is: after insertion, check balance factors bottom-up",),
        ("If |balance| > 1, you rotate. Left-Left = right rotate",),
        ("That actually makes sense now! Thanks a lot 🙏",),
        ("No problem! Practice on LeetCode, problems 108 and 110 are good",),
    ],
    [
        ("Just deployed my portfolio site!",),
        ("Share the link! I wanna see it",),
        ("It's live at mysite.dev, used Next.js + Tailwind",),
        ("This looks incredible! The animations are so smooth",),
        ("Thanks! Used Framer Motion for the transitions",),
        ("I need to update mine, this inspired me ngl",),
    ],
    [
        ("Are you coming to the campus tech meetup?",),
        ("When is it?",),
        ("Next Friday at 5pm in the CS auditorium",),
        ("I'll be there! Are they doing lightning talks?",),
        ("Yeah, 5 minute talks on any tech topic. You should present!",),
        ("Maybe I'll talk about WebRTC... been working on that lately",),
        ("That would be awesome, real-time stuff always gets attention",),
    ],
    [
        ("Started learning Rust 🦀",),
        ("How's it going?",),
        ("The borrow checker is my enemy right now 😭",),
        ("Haha everyone says that. It gets easier after the first project",),
        ("What should I build first?",),
        ("A CLI tool! Small scope, teaches ownership patterns well",),
    ],
    [
        ("Happy birthday! 🎂🎉",),
        ("Thank you so much!! 💕",),
        ("Hope you have an amazing day! Any plans?",),
        ("Dinner with family and then cake cutting at midnight",),
        ("Sounds perfect! Enjoy your day",),
    ],
    [
        ("Did you see the internship posting from Google?",),
        ("Which team?",),
        ("SWE intern, Cloud division. Deadline is next month",),
        ("Already applied last week! Fingers crossed 🤞",),
        ("Same here. Let's prep together for the coding rounds",),
        ("Deal! We can do mock interviews on weekends",),
    ],
    [
        ("The prof just posted the project groups",),
        ("Are we in the same group??",),
        ("YES! Group 7 with Hamza and Zainab too",),
        ("Let's goooo 🚀 Best group ever",),
        ("First meeting tomorrow after class?",),
        ("Works for me. I'll create a shared doc",),
    ],
]

# ─── Avatars from DiceBear API (free, no auth) ────────────────────────
AVATAR_STYLES = ["adventurer", "lorelei", "notionists", "big-smile", "personas", "fun-emoji"]
_avatar_counter = 0

def avatar_url(username):
    """Generate a cool anime/cartoon avatar URL using DiceBear."""
    global _avatar_counter
    style = AVATAR_STYLES[_avatar_counter % len(AVATAR_STYLES)]
    _avatar_counter += 1
    return f"https://api.dicebear.com/9.x/{style}/svg?seed={username}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf"


def run_seed():
    conn = get_db_connection()
    cur = conn.cursor()

    print("=" * 60)
    print("🌱 AuraFlow Database Seeder")
    print("=" * 60)

    # ─── 1. WIPE EXISTING DATA ─────────────────────────────────────
    print("\n🗑️  Clearing all existing data...")
    # Disable FK checks for clean truncation
    cur.execute("SET FOREIGN_KEY_CHECKS = 0")
    tables = [
        "engagement_metrics", "moderation_log", "moderation_logs",
        "wellness_tracking", "mood_tracking", "user_moods",
        "user_mood_history", "knowledge_base", "conversation_summaries",
        "notifications", "ai_agent_logs",
        "attachments", "direct_message_reactions", "direct_messages",
        "message_reactions", "pinned_messages", "messages",
        "voice_participants", "voice_sessions", "voice_channels",
        "channel_members", "channels",
        "blocked_users", "community_members", "communities",
        "friends", "friend_requests",
        "user_roles", "roles",
        "otp_codes",
        "users",
    ]
    for t in tables:
        try:
            cur.execute(f"TRUNCATE TABLE `{t}`")
        except Exception:
            try:
                cur.execute(f"DELETE FROM `{t}`")
            except Exception:
                pass
    cur.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()
    print("   ✅ All tables cleared")

    # ─── 2. INSERT USERS ────────────────────────────────────────────
    print(f"\n👤 Creating {len(USERS)} users...")
    user_ids = {}  # username -> id
    for username, display_name, email in USERS:
        bio = f"Hey! I'm {display_name}. Love tech and connecting with people on AuraFlow."
        cur.execute("""
            INSERT INTO users (username, display_name, email, password, bio, avatar_url, 
                             status, is_first_login, email_verified, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, 'offline', 0, 1, %s)
        """, (
            username, display_name, email, HASHED_PW, bio,
            avatar_url(username),
            datetime.now() - timedelta(days=random.randint(10, 120)),
        ))
        user_ids[username] = cur.lastrowid
    conn.commit()
    print(f"   ✅ {len(user_ids)} users created (password: {PASSWORD})")

    # ─── 3. CREATE COMMUNITIES ──────────────────────────────────────
    print(f"\n🏠 Creating {len(COMMUNITIES)} communities...")
    community_ids = {}  # name -> id
    community_channels = {}  # community_name -> [(channel_id, name, type)]

    for comm in COMMUNITIES:
        # Owner is a random user from first 20
        owner_username = USERS[random.randint(0, 19)][0]
        owner_id = user_ids[owner_username]

        cur.execute("""
            INSERT INTO communities (name, description, icon, color, logo_url, banner_url, created_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            comm["name"], comm["description"], comm["icon"], comm["color"],
            comm["logo_url"], comm["banner_url"], owner_id,
            datetime.now() - timedelta(days=random.randint(30, 180)),
        ))
        comm_id = cur.lastrowid
        community_ids[comm["name"]] = comm_id

        # Add owner as member with 'owner' role
        cur.execute("""
            INSERT INTO community_members (community_id, user_id, role)
            VALUES (%s, %s, 'owner')
        """, (comm_id, owner_id))

        # Add 15-35 random members
        member_count = random.randint(15, 35)
        member_usernames = random.sample(
            [u[0] for u in USERS if u[0] != owner_username],
            min(member_count, len(USERS) - 1)
        )

        for i, mu in enumerate(member_usernames):
            role = "admin" if i < 2 else "member"
            cur.execute("""
                INSERT IGNORE INTO community_members (community_id, user_id, role, joined_at)
                VALUES (%s, %s, %s, %s)
            """, (comm_id, user_ids[mu], role,
                  datetime.now() - timedelta(days=random.randint(1, 90))))

        # Create channels
        channels = []
        for ch_name, ch_type, ch_desc in comm["channels"]:
            cur.execute("""
                INSERT INTO channels (name, description, type, community_id, created_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (ch_name, ch_desc, ch_type, comm_id, owner_id))
            ch_id = cur.lastrowid
            channels.append((ch_id, ch_name, ch_type))

            # Add all community members to channel
            cur.execute("""
                INSERT IGNORE INTO channel_members (channel_id, user_id, role)
                SELECT %s, user_id, 
                    CASE WHEN role = 'owner' THEN 'admin'
                         WHEN role = 'admin' THEN 'admin'
                         ELSE 'member' END
                FROM community_members WHERE community_id = %s
            """, (ch_id, comm_id))

        community_channels[comm["name"]] = channels
        print(f"   ✅ {comm['name']} — {member_count + 1} members, {len(channels)} channels")

    conn.commit()

    # ─── 4. INSERT MESSAGES ─────────────────────────────────────────
    print("\n💬 Populating channel messages...")
    total_msgs = 0

    for comm_name, channel_msgs in CHANNEL_MESSAGES.items():
        comm_id = community_ids.get(comm_name)
        if not comm_id:
            continue

        channels = community_channels.get(comm_name, [])

        for ch_id, ch_name, ch_type in channels:
            if ch_type == "voice":
                continue

            msgs = channel_msgs.get(ch_name, [])
            if not msgs:
                continue

            # Get members of this channel
            cur.execute("""
                SELECT user_id FROM channel_members WHERE channel_id = %s
            """, (ch_id,))
            member_rows = cur.fetchall()
            member_ids = [r["user_id"] for r in member_rows]
            if not member_ids:
                continue

            base_time = datetime.now() - timedelta(days=random.randint(2, 14))

            for i, msg in enumerate(msgs):
                sender = random.choice(member_ids)
                msg_time = base_time + timedelta(minutes=random.randint(i * 5, i * 5 + 30))
                cur.execute("""
                    INSERT INTO messages (channel_id, sender_id, content, message_type, created_at)
                    VALUES (%s, %s, %s, 'text', %s)
                """, (ch_id, sender, msg, msg_time))
                total_msgs += 1

    conn.commit()
    print(f"   ✅ {total_msgs} channel messages inserted")

    # ─── 5. CREATE FRIENDSHIPS ──────────────────────────────────────
    print("\n🤝 Creating friendships...")
    friendship_count = 0
    all_usernames = [u[0] for u in USERS]

    # Each user gets 5-15 friends
    for username in all_usernames:
        uid = user_ids[username]
        friend_count = random.randint(5, 15)
        potential_friends = [u for u in all_usernames if u != username]
        chosen = random.sample(potential_friends, min(friend_count, len(potential_friends)))

        for friend_username in chosen:
            fid = user_ids[friend_username]
            # Check if friendship already exists (either direction)
            cur.execute("""
                SELECT id FROM friends 
                WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s)
            """, (uid, fid, fid, uid))
            if cur.fetchone():
                continue

            # Create accepted friend request
            req_time = datetime.now() - timedelta(days=random.randint(5, 90))
            cur.execute("""
                INSERT IGNORE INTO friend_requests (sender_id, receiver_id, status, created_at)
                VALUES (%s, %s, 'accepted', %s)
            """, (uid, fid, req_time))

            # Create bidirectional friendship
            cur.execute("""
                INSERT IGNORE INTO friends (user_id, friend_id, created_at)
                VALUES (%s, %s, %s)
            """, (uid, fid, req_time))
            cur.execute("""
                INSERT IGNORE INTO friends (user_id, friend_id, created_at)
                VALUES (%s, %s, %s)
            """, (fid, uid, req_time))
            friendship_count += 1

    # Also add some pending friend requests
    pending_count = 0
    for _ in range(20):
        s = random.choice(all_usernames)
        r = random.choice([u for u in all_usernames if u != s])
        sid, rid = user_ids[s], user_ids[r]
        cur.execute("""
            SELECT id FROM friend_requests WHERE sender_id = %s AND receiver_id = %s
        """, (sid, rid))
        if not cur.fetchone():
            cur.execute("""
                INSERT IGNORE INTO friend_requests (sender_id, receiver_id, status, created_at)
                VALUES (%s, %s, 'pending', %s)
            """, (sid, rid, datetime.now() - timedelta(days=random.randint(0, 5))))
            pending_count += 1

    conn.commit()
    print(f"   ✅ {friendship_count} friendships created")
    print(f"   ✅ {pending_count} pending friend requests")

    # ─── 6. CREATE DIRECT MESSAGES ──────────────────────────────────
    print("\n✉️  Creating direct message conversations...")
    dm_count = 0

    # Get all friendship pairs
    cur.execute("SELECT DISTINCT user_id, friend_id FROM friends")
    friendships = cur.fetchall()

    # Pick random friend pairs for DM conversations
    dm_pairs_done = set()
    random.shuffle(friendships)

    for fs in friendships[:40]:  # up to 40 DM conversations
        uid = fs["user_id"]
        fid = fs["friend_id"]
        pair_key = tuple(sorted([uid, fid]))
        if pair_key in dm_pairs_done:
            continue
        dm_pairs_done.add(pair_key)

        # Pick a random conversation template
        convo = random.choice(DM_CONVERSATIONS)
        base_time = datetime.now() - timedelta(days=random.randint(1, 30))
        participants = [uid, fid]

        for i, (msg_text,) in enumerate(convo):
            sender = participants[i % 2]
            receiver = participants[(i + 1) % 2]
            msg_time = base_time + timedelta(minutes=random.randint(i * 3, i * 3 + 15))
            cur.execute("""
                INSERT INTO direct_messages (sender_id, receiver_id, content, message_type, is_read, created_at)
                VALUES (%s, %s, %s, 'text', 1, %s)
            """, (sender, receiver, msg_text, msg_time))
            dm_count += 1

    conn.commit()
    print(f"   ✅ {dm_count} direct messages across {len(dm_pairs_done)} conversations")

    # ─── 7. ADD SOME REACTIONS ──────────────────────────────────────
    print("\n😀 Adding message reactions...")
    reaction_count = 0
    emojis = ["👍", "❤️", "😂", "🔥", "👏", "🎉", "💯", "🚀", "😍", "🤔"]

    # Get some message IDs
    cur.execute("SELECT id, channel_id FROM messages ORDER BY RAND() LIMIT 60")
    random_msgs = cur.fetchall()

    for msg_row in random_msgs:
        # Get channel members for this message's channel
        cur.execute("""
            SELECT user_id FROM channel_members WHERE channel_id = %s ORDER BY RAND() LIMIT 3
        """, (msg_row["channel_id"],))
        reactors = cur.fetchall()

        for reactor in reactors:
            emoji = random.choice(emojis)
            try:
                cur.execute("""
                    INSERT IGNORE INTO message_reactions (message_id, user_id, emoji)
                    VALUES (%s, %s, %s)
                """, (msg_row["id"], reactor["user_id"], emoji))
                reaction_count += 1
            except Exception:
                pass

    conn.commit()
    print(f"   ✅ {reaction_count} reactions added")

    # ─── 8. SEED AI AGENTS ──────────────────────────────────────────
    print("\n🤖 Seeding AI agents...")
    agents = [
        ("Mood Tracker", "mood", "Detects user mood from messages using NLP"),
        ("Summarizer", "summarizer", "Generates channel conversation summaries"),
        ("Moderator", "moderator", "Flags toxic or harmful content"),
        ("Engagement Bot", "engagement", "Tracks and boosts channel engagement"),
        ("Knowledge Builder", "knowledge", "Extracts FAQs from conversations"),
        ("Wellness Agent", "wellness", "Monitors user wellness and suggests breaks"),
    ]
    for name, atype, desc in agents:
        cur.execute("""
            INSERT IGNORE INTO ai_agents (name, type, description, is_active)
            VALUES (%s, %s, %s, 1)
        """, (name, atype, desc))
    conn.commit()
    print(f"   ✅ {len(agents)} AI agents seeded")

    # ─── DONE ───────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("🎉 SEEDING COMPLETE!")
    print("=" * 60)
    print(f"""
📊 Summary:
   • {len(USERS)} users created (password: {PASSWORD})
   • {len(COMMUNITIES)} communities with logos & banners
   • {sum(len(c) for c in community_channels.values())} channels
   • {total_msgs} channel messages
   • {friendship_count} friendships + {pending_count} pending requests
   • {dm_count} direct messages across {len(dm_pairs_done)} conversations
   • {reaction_count} message reactions
   • {len(agents)} AI agents
   
🔑 All users can login with password: {PASSWORD}
   Example: username=ahmedkhan, password={PASSWORD}
""")

    cur.close()
    conn.close()


if __name__ == "__main__":
    run_seed()
