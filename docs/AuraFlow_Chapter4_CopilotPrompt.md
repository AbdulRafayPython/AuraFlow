# GitHub Copilot Prompt — AuraFlow FYP Report: Chapter 4 Professional Formatting + Test Cases

---

## CONTEXT: YOUR PROJECT

You are working on the Final Year Project (FYP) report for **AuraFlow** — an AI-powered real-time communication platform built using:
- **Frontend:** React.js + TypeScript + Tailwind CSS + Vite
- **Backend:** Python 3.10, Flask, Flask-SocketIO, Celery
- **Databases:** MySQL 8.0, Redis
- **AI Agents:** Mood Tracker (Roman Urdu lexicon-based), Summarizer (TextRank + abstractive), Moderator (NLP keyword/regex), Knowledge Builder (Sentence-BERT + FAISS)
- **Real-Time:** Socket.IO (WebSockets), WebRTC (voice)
- **Dev Tools:** Git, GitHub, Postman, VS Code

The report file is: `FYP-1_FINAL_REPORT_Formatted.docx`
Chapter 4 is titled **"Implementation & Results"** and already has partial content in sections 4.1 through 4.5.

---

## YOUR TASK

You must do **three things** in sequence:

### TASK 1: Analyze the Codebase
### TASK 2: Generate Test Cases from the Codebase
### TASK 3: Reformat Chapter 4 to Professional Standard

---

## TASK 1 — ANALYZE THE CODEBASE

Before writing anything, scan the entire project codebase. Focus on:

1. **Backend routes** — all Flask API endpoints (auth, messaging, community, channels)
2. **AI Agent modules** — `agents/` directory: mood tracker, summarizer, moderator, wellness, engagement, knowledge builder
3. **Celery tasks** — `tasks/agent_tasks.py` and any scheduled jobs
4. **Socket.IO events** — all `emit()` and `on()` handlers
5. **Frontend components** — key React components (ChatWindow, CommunityList, MoodDashboard, SummaryPanel, etc.)
6. **Database models** — SQLAlchemy or raw MySQL schemas (Users, Servers, Channels, Messages, UserMoods)
7. **Test files** — any existing `test_*.py` or `*.test.js` files

Use this analysis to generate realistic, accurate test cases in Task 2.

---

## TASK 2 — GENERATE TEST CASES

Based on your codebase analysis, generate a **complete, professional test case suite** organized into **5 tables**. Each table maps to a system module.

### Rules for Test Cases:
- Every test case must be **derived from actual code** you found in the codebase — not generic placeholders
- Use real function names, route paths, event names, and agent behaviors where possible
- Status column should always be **Pass** (as this is a final report)
- Test ID format: `TC-01`, `TC-02`, etc. — continuous numbering across all tables
- Minimum **5 test cases per table**, maximum **8**

### The 5 Tables to Generate:

**Table 4.1 — Authentication & User Management**
Cover: registration, login with valid/invalid credentials, JWT issuance, OTP password recovery, duplicate email check, session expiry, logout

**Table 4.2 — Real-Time Messaging & WebSockets**
Cover: message send/receive via Socket.IO, typing indicator broadcast, online presence update, file/image upload, emoji reaction, edit/delete message, browser notification when tab is hidden

**Table 4.3 — AI Agent Functionality**
Cover: Roman Urdu mood detection (positive/negative/neutral), on-demand /summarize command, scheduled daily summary, moderation of toxic content, wellness reminder trigger, engagement prompt on quiet channel, knowledge extraction from conversation

**Table 4.4 — Community & Channel Management**
Cover: create community, join via invite link, create text channel, create voice channel, assign moderator role, kick/ban member, channel visibility settings, admin dashboard data load

**Table 4.5 — Voice Communication & WebRTC**
Cover: peer-to-peer WebRTC connection negotiation, SDP offer/answer exchange, ICE candidate handling, multi-user voice channel, connection drop/recovery, audio mute/unmute

### Table Format (for EACH table):

| Test ID | Test Scenario | Pre-conditions | Test Steps | Expected Result | Actual Result | Status |
|---------|--------------|----------------|-----------|----------------|---------------|--------|

---

## TASK 3 — REFORMAT CHAPTER 4 IN THE WORD FILE

Open `FYP-1_FINAL_REPORT_Formatted.docx` and apply ALL of the following changes to **Chapter 4 only**.

---

### A. GLOBAL TEXT RULES (Apply to ALL Chapter 4 text)

1. **Remove all em-dashes (—)** from the text. Replace each with a comma, semicolon, or restructure the sentence naturally.
2. **Remove all hyphens used as list starters** (lines starting with "- "). Convert to proper Word bullet lists or rewrite as flowing prose.
3. **Humanize the writing** — rewrite any robotic, AI-sounding, or overly formal phrasing into natural academic English. The tone should sound like a confident, articulate university student, not a language model. Avoid phrases like "it is worth noting that", "it is important to highlight", "leveraging", "seamlessly", "robust", "functionality", "moreover", "furthermore", "in conclusion" (unless in the actual conclusion).
4. **Do not change any technical facts**, code logic, agent descriptions, or test results.
5. **Fix passive voice overuse** — if more than 2 consecutive sentences are passive, rewrite at least one as active voice.

---

### B. FORMATTING & VISUAL STYLE

#### Headings
- **Chapter Title** (e.g., "Chapter 4: Implementation & Results"): Bold, 16pt, center-aligned, dark navy color (`#1F3864`), spacing 24pt before and 12pt after
- **Section Headings** (4.1, 4.2, etc.): Bold, 13pt, left-aligned, dark navy color (`#1F3864`), spacing 18pt before, 6pt after, with a thin bottom border line (`#2E75B6`, 1pt)
- **Sub-section Headings** (e.g., "Frontend Implementation"): Bold, 12pt, left-aligned, `#2E75B6`, spacing 12pt before, 4pt after, no border

#### Body Text
- Font: **Calibri 11pt**
- Line spacing: **1.15**, spacing after paragraph: **6pt**
- Justified alignment
- No orphan lines (Word widow/orphan control: ON)

#### Code Snippets
- Font: **Courier New 9pt**
- Background shading: light gray (`#F2F2F2`)
- Left border accent: `#2E75B6`, 3pt solid
- Single-spaced
- Indented 0.5 inches from left margin
- Caption below in italics: *Figure 4.X: [Description of the code snippet]*

#### Images / Screenshots
- Center-aligned on the page
- Width: exactly **14cm** (do not stretch or distort)
- Border: thin `#CCCCCC` 0.5pt border
- Caption directly below: bold label ("Figure 4.X:") followed by normal text description
- Spacing: 6pt above image, 4pt below caption, 12pt before next paragraph

---

### C. TEST CASE TABLES (Section 4.4)

Replace the existing 3 small test case tables with the **5 new tables** generated in Task 2.

Apply the following formatting to EVERY test case table:

**Table structure:**
- 7 columns: Test ID | Test Scenario | Pre-conditions | Test Steps | Expected Result | Actual Result | Status
- Column widths (approximate): 1.2cm | 3.5cm | 3cm | 4cm | 4cm | 3cm | 1.8cm

**Header row:**
- Background: `#1F3864` (dark navy)
- Text: White, Bold, 10pt, centered
- Cell padding: top/bottom 80 twips, left/right 120 twips

**Alternating rows:**
- Odd rows: White background
- Even rows: Light blue `#DEEAF1`
- Text: Calibri 10pt, black, left-aligned
- Status "Pass" cells: text in bold, dark green `#375623`

**Table borders:**
- All internal borders: `#BFBFBF`, 0.5pt single
- Outer border: `#1F3864`, 1pt single

**Table caption (above each table):**
- Format: **Table 4.X: [Table Title]**
- Bold, 11pt, left-aligned, spacing 12pt before table, 4pt after caption

**Explanation paragraph below each table:**
- Write 2–3 sentences in natural, humanized academic English explaining what the table covers and what the results confirm.
- No dashes. No bullet points. Complete sentences only.

---

### D. SECTION 4.5 RESULTS & EVALUATION

This section must include the following elements in order:

1. **Opening paragraph** (humanized, ~100 words): Introduce what was evaluated and why these metrics were chosen.

2. **AI Agent Performance Table:**
   Create a formatted summary table titled "Table 4.6: AI Agent Performance Summary" with columns:
   - Agent Name | Metric | Observed Value | Benchmark / Target | Assessment
   
   Populate with these values:
   | Agent | Metric | Observed | Target | Assessment |
   |---|---|---|---|---|
   | Mood Tracker (Roman Urdu) | Classification Accuracy | ~78% | ≥75% | Met |
   | Summarizer | Summary generation time | 3–5 seconds | ≤10 seconds | Met |
   | Summarizer | Message compression ratio | ~150 msgs → ~200 words | Context-preserving | Met |
   | Moderation Agent | Toxic content detection rate | ~85% | ≥80% | Met |
   | WebSocket Messaging | Round-trip latency | ~45ms | ≤100ms | Met |
   | Celery Task Queue | Background task success rate | 100% | 100% | Met |

   Apply the same table formatting as Section 4.4 (navy header, alternating rows).

3. **System Performance paragraph** (~150 words, humanized): Discuss the ~45ms latency, Celery async stability, and the Flask event loop responsiveness. Write in active voice. No dashes.

4. **Evaluation Summary paragraph** (~100 words, humanized): Conclude what the results mean for the project's success criteria. Avoid clichés.

---

### E. SECTION WORD COUNT TARGETS

Ensure each section meets its word count by expanding existing content (do not pad with filler — expand with technically accurate detail):

| Section | Current Status | Target Word Count |
|---|---|---|
| 4.1 Development Environment | Partially written | 200–300 words |
| 4.2 Implementation Details | Partially written | 600–800 words |
| 4.3 Testing Strategy | Written | 300–500 words |
| 4.4 Test Cases | Needs replacement | Tables + 200 words explanation |
| 4.5 Results & Evaluation | Written | 500–700 words |

---

### F. PAGE LAYOUT

- **Page size:** A4
- **Margins:** Top 2.5cm, Bottom 2.5cm, Left 3cm, Right 2.5cm
- **Header:** Chapter title left-aligned, page number right-aligned, separated by a thin `#2E75B6` bottom border
- **Footer:** University name centered, thin top border
- **Page numbers:** Chapter 4 starts from whichever page it falls on — do not restart numbering

---

### G. FINAL VALIDATION CHECKLIST

Before saving, verify:

- [ ] All em-dashes removed
- [ ] No lines starting with " - " (bare hyphens)
- [ ] All 5 test case tables are present with 7-column format
- [ ] All tables have navy headers and alternating row shading
- [ ] All images are 14cm wide, centered, with captions
- [ ] Code snippet has gray background and blue left border
- [ ] Section headings have bottom border line
- [ ] Table 4.6 (performance summary) is present in section 4.5
- [ ] No "robotic" or AI-sounding phrasing remains
- [ ] Word count targets met for each section
- [ ] Passive voice not overused
- [ ] File saved as `.docx` (not `.doc`)

---

## OUTPUT

Save the modified file as:
`FYP-1_FINAL_REPORT_Chapter4_Updated.docx`

Do not modify any other chapter. Only Chapter 4 is in scope.

---

*Prompt prepared for GitHub Copilot — AuraFlow FYP, KIET University*
