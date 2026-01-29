AuraFlow: An AI-Powered Communication
Platform with Intelligent Agents
Members:
S# Student ID Name
Contact No: email:
1
14497
Abdul Rafay
2
14514
03130005968 scig27267@gmail.com
Syeda Zehra Batool Abdi 03153174105 zb2202469@gmail.com
3
14610
Rabia Naseer
4
15127
03162138913 nrabia871@gmail.com
Muhammad Anas
03191963670 muhammadanas15127@gmail.com
Supervisor Name: Muhammad Zaid
Abstract
ModernplatformslikeSlack,Discord,andTeamsexcelatmessagingandcalls,buttheylackemotional
intelligenceandtools tomanageoverload. Usersoftenfacemessyconversations,missedcontext, and
unnoticedemotional fatigue. AuraFlowtacklesthisbycombiningreal-timecommunicationwithbuilt
inAIagents. Theseagentstrackmood, summarizechats,filter toxiccontent, translateRomanUrdu,
encourageengagement, suggestwellnessbreaks, andbuildasearchableknowledgebase. Akey focus
isRomanUrdumoodtracking. Insteadofheavydeeplearning,AuraFlowusesa lightweight lexicon
basedapproach, supportedbynormalizationrulesandemojidetection. Forbroadercoverage,aGoogle
Translate+VADERpipeline is alsoavailable. This balancemakes the systembothpractical and
explainable,fittingforafinal-yearproject.
Contents
1 Introduction 2
1.1 Background&Motivation . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 2
1.2 Objectives . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
1.3 Contribution . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2 RelatedWork 3
2.1 MessagingPlatforms . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2.2 SentimentAnalysisinRomanUrdu. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2.3 SummarizationSystems . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2.4 Toxicity&SpamModeration . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 3
2.5 AI inCommunicationWellness . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
3 SystemDesign&Architecture 4
3.1 Overview . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
3.2 High-LevelArchitecture . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
3.3 AgentsintheSystem. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 4
3.4 WorkflowExample . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
3.5 AdvantagesofModularDesign . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4 Implementation 5
4.1 MoodTrackingAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4.1.1 Lexicon-BasedApproach. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4.1.2 Normalization. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4.1.3 NegationHandling . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4.1.4 Emojis&ShortForms . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 5
4.1.5 ScoringSystem. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.1.6 AlternativeApproach(Translation-Based) . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.1.7 Example. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.2 SummarizerAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
1
4.2.1 ExtractiveSummarization . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.2.2 AbstractiveSummarization(Optional) . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.2.3 Workflow . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.2.4 Example. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.3 TranslatorAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 6
4.4 EngagementAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.5 WellnessAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.6 KnowledgeBuilderAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.7 ContentModerationAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.8 Context-AwareSupportAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.8.1 Workflow . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 7
4.8.2 Integration . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.8.3 Example. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.9 AIAssistantAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.9.1 Features . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.9.2 Workflow . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.9.3 Example. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.10AutoMessageGeneratorAgent . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 8
4.10.1 Rule-BasedTemplateApproach(DefaultMode) . . . . . . . . . . . . . . . . . . . . . 9
4.10.2 OptionalAI-EnhancedMode . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9
4.10.3 ImplementationWorkflow . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9
4.10.4 Example. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . 9
5 ImplementationandTesting 9
6 ResultsandFindings 10
7 Conclusion&FutureWork 10
1 Introduction
1.1 Background&Motivation
Communicationtoolsareessential forstudygroups, teams, andcommunities. Butafterdaysof chatting,
messagespileup,makingithardtocatchup.Emotionalwell-beingisalsooftenignored—studentsmayfeel
stressedwithoutsupport.AuraFlowaddressesthesegapsbyembeddingintelligentagentsintotheplatform.
Theseagents:
•Trackmoodsandvisualizeemotionaltone.
•Summarizelongchatsintodigestiblepoints.
•Moderatespamandtoxicity.
•TranslateRomanUrdu￿English.
•Encourageengagementwithpollsandprompts.
•Suggestwellnesspractices.
2
• Build a knowledge base from shared content.
This creates a smarter, more supportive communication space.
1.2 Objectives
AuraFlow aims to:
1. Build a real-time chat and calling system.
2. Add intelligent agents that run automatically in the background.
3. Implement a lightweight Roman Urdu mood tracker using a lexicon.
4. Keep everything simple and explainable for juries and users.
5. Stay realistic about constraints (limited GPUs, short timelines).
1.3 Contribution
AuraFlow doesn’t reinvent chat systems—it enhances them with lightweight AI agents. Its strength lies in
showing how students can design practical, resource-friendly solutions. The Roman Urdu lexicon approach
is novel, and the React–Flask–multi-database setup demonstrates solid technical depth.
2 Related Work
2.1 Messaging Platforms
Popular tools like Slack, Discord, and Microsoft Teams provide text, voice, and file sharing. However, they
are built mainly for productivity and lack emotional intelligence. Users often miss subtle emotional signals in
long chats. AuraFlow bridges this gap by embedding mood awareness and well-being features into everyday
communication.
2.2 Sentiment Analysis in Roman Urdu
Research in sentiment analysis has focused mostly on English and Urdu (in Arabic script). Roman Urdu,
widely used in Pakistan and India, has fewer resources due to inconsistent spelling and lack of datasets.
Some attempts involve:
• Lexicon-based methods (keyword matching).
• Translating Roman Urdu → English → applying English sentiment tools.
AuraFlow adopts a hybrid approach: a lexicon-based Roman Urdu analyzer plus a translation-based pipeline.
This ensures reliability without needing massive datasets or GPUs.
2.3 Summarization Systems
Summarization methods are typically of two types:
• Extractive (e.g., TextRank)– picking the most relevant sentences.
• Abstractive (e.g., T5, BART)– generating new, concise sentences.
Prior systems like Gensim (TextRank) and Hugging Face models show strong results but are often resource
heavy. AuraFlow balances this by combining extractive (lightweight) and abstractive (optional) methods
depending on hardware.
2.4 Toxicity & Spam Moderation
Platforms like Reddit and YouTube rely on ML classifiers (Perspective API, keyword filters) for toxicity
detection. AuraFlow integrates a simpler, explainable filter that flags spam, abusive language, and repetitive
content in real-time.
3
2.5 AI in Communication Wellness
Wellness-focused chatbots (e.g., Woebot, Wysa) have proven that lightweight AI agents can support mental
health. AuraFlow takes inspiration by including Wellness and Engagement Agents that encourage breaks,
positivity, and teamwork.
3 System Design & Architecture
3.1 Overview
AuraFlow is built as a modular client–server system. At its core is a real-time messaging platform, enhanced
by multiple AI-driven agents. Each agent runs independently but communicates through a shared database
and API layer. This design keeps the system scalable, fault-tolerant, and explainable.
3.2 High-Level Architecture
• Frontend (React + Tailwind):– Provides a clean chat interface with features like channels, threads, and dashboards.– Integrates controls for on-demand triggers (e.g., “/summarize”).– Displays AI agent outputs as system messages or dashboard widgets.
• Backend (Flask + Python):– Acts as the middleware connecting frontend, databases, and AI agents.– Handles authentication, socket connections, and agent scheduling.– Exposes REST + WebSocket APIs for real-time updates.
• Databases:– MySQL: Stores chat histories, agent results, user metadata.– Redis (optional): Used for caching recent messages for faster summarization and moderation.
• AI Agents (Python-based):– Each agent runs as a background worker or on-demand service.– Communication between agents and backend handled via Flask endpoints or message queues.
3.3 Agents in the System
1. Mood Tracking Agent (Lexicon + Translation):
• Detects sentiment in Roman Urdu using lexicon rules.
• Alternative pipeline: Roman Urdu → English (Google Translate API) → VADER/Gemini/GPT
analysis.
2. Summarizer Agent:
• Extractive (TextRank) for lightweight summaries.
• Abstractive (T5/BART) for richer summaries if GPU available.
• Saves summary as a “system message” in MySQL.
3. Translator Agent:
• On-demand translation (Roman Urdu ￿ English).
• Supports mixed-language chats.
4. Engagement Agent:
• Generates polls, reminders, or fun prompts.
• Boosts user interaction in low-activity channels.
5. Wellness Agent:
• Detects stress indicators.
• Suggests wellness tips (break reminders, positivity prompts).
6. Knowledge Builder Agent:
• Extracts key Q&A or facts from chat.
• Builds a structured knowledge base for easy search later.
7. Content Moderation Agent:
4
• Filters toxic, spam, or repetitive content.
• Runs in real-time for message safety.
3.4 Workflow Example
1. A user types: “Mujhe bura lag raha hai ￿”.
2. Mood Tracking Agent detects negative sentiment (lexicon/translation).
3. Wellness Agent notices repeated negativity → pushes a break reminder.
4. Later, a group of 200+ messages is summarized by the Summarizer Agent.
5. Knowledge Builder Agent extracts an FAQ entry if the chat contains definitions or decisions.
6. All outputs appear in the chat as system-generated messages with timestamps.
3.5 Advantages of Modular Design
• Agents are loosely coupled → easy to add/replace.
• Can run on low-end hardware (only lexicon/TextRank) or scale to GPUs (T5/GPT).
• Each agent is explainable and can be evaluated independently.
4 Implementation
AuraFlow integrates multiple AI-driven agents into a real-time chat system. Each agent is modular, runs on
Flask microservices, and communicates with the frontend via Socket.IO. Below are the detailed implemen
tations.
4.1 Mood Tracking Agent
Detects emotional tone in conversations, focusing on Roman Urdu.
4.1.1 Lexicon-Based Approach
• Dictionary of words with sentiment values.
• Example:– Positive: acha (+1), khushi (+2)– Negative: bura (-1), ghussa (-2)– Neutral: dost (0), waqt (0)
4.1.2 Normalization
Handles spelling variations (acha, achaa, achaaa → acha).
4.1.3 Negation Handling
• acha → Positive (+1)
• acha nahi → Negative (-1)
4.1.4 Emojis & Short Forms
• ￿ (+1), ￿ (-2), ￿ (-2)
• hpy →happy
5
4.1.5 Scoring System
• Score > 0 → Positive
• Score < 0 → Negative
• Score = 0 → Neutral
4.1.6 Alternative Approach (Translation-Based)
Uses Google Translate API → Roman Urdu → English → sentiment analysis (VADER, Gemini, GPT).
4.1.7 Example
Input: “Mujhe acha lag raha hai ￿”
• Translation: “I am feeling good ￿”
• Sentiment → Positive (+1)
• Emoji ￿ → +1
• Total = +2 → Positive
4.2 Summarizer Agent
Reduces information overload by condensing long chat histories.
4.2.1 Extractive Summarization
• TextRank (via Gensim/custom graph).
• Selects top-ranked sentences.
4.2.2 Abstractive Summarization (Optional)
• T5-small or BART-mini (Hugging Face).
• Generates paraphrased summaries.
4.2.3 Workflow
1. Fetch last N messages.
2. Clean (remove usernames/timestamps).
3. Summarize (5–10 bullet points).
4. Store as system message in MySQL.
5. Broadcast via Socket.IO.
4.2.4 Example
Input: 150 messages on “project deadline.” Output: “Team discussed shifting deadline, decided next review
on Friday.”
4.3 Translator Agent
Enables multilingual chat.
• Uses Google Translate API.
• On-demand trigger: “/translate”.
6
• Preserves emojis and short forms.
• Stores both original + translated text.
Example: Input: “Kal milte hain ￿” Output: “Let’s meet tomorrow ￿”
4.4 Engagement Agent
Encourages user participation.
• Detects inactivity in channels.
• Suggests polls, motivational prompts, icebreakers.
• Triggered via Flask schedulers.
Example: “It’s quiet here ￿. Should we start a quick poll?”
4.5 Wellness Agent
Promotes healthy communication habits.
• Monitors mood trends (via Mood Tracker).
• Sends break reminders or positivity boosts.
Example: “You’ve had many stressful chats today. Take a 5-minute pause.”
4.6 Knowledge Builder Agent
Builds a structured knowledge base from chats.
• Detects FAQs, repeated questions, decisions.
• Stores Q/A pairs in MySQL with tags.
Example:
• Chat: “What is Docker?”
• Answer: “It’s a containerization platform.”
• Saved as FAQ entry.
4.7 Content Moderation Agent
Ensures safe and professional communication.
• Detects spam, abusive words, repetitive text.
• Uses regex + keyword filters.
• Flags messages → stored separately for admin review.
Example: “You are stupid” → Flagged (toxic)
4.8 Context-Aware Support Agent
Retrieves information dynamically from chat/document history.
4.8.1 Workflow
1. Embedding Storage: Chat/document text → embeddings via FAISS + LangChain.
2. Query Handling: User asks → search top-K similar chunks.
3. Answer Generation:
• Gemini API (testing).
• GPTAPI (advanced).
7
4.8.2 Integration
Answer shown as a system message in chat.
4.8.3 Example
User: “What framework are we using for frontend?”
• Embedding match: “React.js with TailwindCSS.”
• Agent: “Frontend framework chosen: React.js with TailwindCSS.”
4.9 AI Assistant Agent
The AI Assistant Agent provides general-purpose conversational support inside AuraFlow. Unlike the task
specific agents (Summarizer, Translator, Mood Tracker), this one acts as a chatbot companion for FAQs,
quick answers, or light engagement.
4.9.1 Features
• General Q&A: Users can ask knowledge-based questions.
• Casual Conversation: Jokes, greetings, motivational responses.
• Productivity Help: Quick definitions, task reminders, or summaries on demand.
4.9.2 Workflow
1. User Query → detected via special command (“/ask” or direct message).
2. Backend Processing:
• Gemini API (lightweight testing).
• GPTAPI (advanced mode for contextual + nuanced answers).
3. Response Formatting:
• Short, direct answers for factual queries.
• Polite, conversational replies for casual use.
4. Integration:
• Sent back via Socket.IO.
• Displayed as a bot message with a unique “Assistant” tag in the chat UI.
4.9.3 Example
• User: “/ask What is an API?”
• Assistant: “An API (Application Programming Interface) is a set of rules that allows one software to
interact with another.”
• User: “Tell me a joke ￿”
• Assistant: “Sure! Why don’t programmers like nature? Too many bugs ￿.”
4.10 Auto Message Generator Agent
The Auto Message Generator Agent enhances user engagement by providing instant welcome messages and
quick replies. This ensures smooth onboarding for new users and faster interaction in conversations, without
requiring heavy AI models.
8
4.10.1 Rule-Based Template Approach (Default Mode)
To keep the system lightweight and offline-ready, the agent primarily relies on predefined templates stored
in JSON or a database.
• Welcome Messages: Triggered automatically when a new user joins. Example templates:– “￿ Welcome, {username}! Glad to have you here.”– “￿ Hey {username}, welcome to the group!”
• Quick Replies: Suggested when specific keywords are detected.– Input: “thanks” / “shukriya” → Replies: “￿ You’re welcome!”, “￿ Anytime!”– Input: “bye” / “khuda hafiz” → Replies: “￿ Take care!”, “See you soon!”
• Triggering:– User join event → welcome message.– Keyword/pattern detection → quick reply suggestions.
This mode is fast, cost-free, and offline-friendly, making it ideal for deployment within FYP constraints.
4.10.2 Optional AI-Enhanced Mode
For greater personalization, the agent can optionally integrate with Gemini API (testing) or GPT API
(advanced).
• Generates varied, context-aware replies instead of fixed templates.
• Example: “Hey {username}, it’s awesome to see you here! ￿”
However, this mode requires internet access and may incur API costs, so it remains optional.
4.10.3 Implementation Workflow
1. Trigger Detection: User joins (welcome) or sends a message (keyword check).
2. Template Selection: Pick a random template from JSON/DB.
3. Message Generation: Fill placeholders (e.g., username) and attach emojis.
4. Output Delivery: Push via Socket.IO → ChatWindow.jsx.
5. (Optional) If AI mode is enabled → call Gemini/GPT for a more dynamic response.
4.10.4 Example
• Input: User joins chat → “￿ Welcome, Ali! Glad to have you here.”
• Input: User sends “thanks” → “￿ You’re welcome!”
5 Implementation and Testing
The AuraFlow system was implemented using a modular agent-based architecture, each focusing on a specific
function (e.g., Mood Tracking, Summarizer, Translator, Auto Message Generator).
• Backend: Python (Flask) with support for asynchronous tasks via aiohttp and background schedulers.
• Database: MySQL for persistent storage; Redis for caching frequently accessed data.
• Frontend: React (MessageInput.jsx, ChatWindow.jsx) integrated with Socket.IO for real-time updates.
• APIs & Libraries:– Lexicon-based sentiment analysis (custom word dictionary).– Google Translate + VADER for translation-based sentiment.– TextRank (Gensim) for extractive summarization.– T5/BART-mini (optional) for abstractive summarization.– Predefined templates for Auto Message Generator (offline mode).– Gemini/GPT APIs (optional, advanced mode).
9
Testing
• UnitTesting: Eachagent validated independently (e.g., Mood Agent tested with positive/negative/neutral
Roman Urdu sentences).
• Integration Testing: Agents connected through Flask routes and Socket.IO, ensuring smooth flow of
messages from input → processing → dashboard output.
• Performance Checks: Lightweight agents (Lexicon, Rule-based templates) tested offline; API-based
modules tested with sample API keys.
6 Results and Findings
AuraFlow successfully integrated AI agents into a real-time chat platform.
• Mood Tracking Agent: Lexicon-based method was fast and explainable; Google Translate + VADER
gave higher accuracy for mixed Roman Urdu–English chats.
• Summarizer Agent: TextRank worked for quick extracts; T5-small improved quality but required more
resources.
• Translator Agent: Enabled seamless multilingual interaction.
• Auto Message Generator: Template-based rules provided efficient welcome and quick replies without
APIs.
• System Performance: Socket.IO ensured low-latency messaging; Redis caching boosted scalability.
Overall: The platform combined communication, emotional AI, and productivity support with modular,
scalable design.
7 Conclusion & Future Work
AuraFlow demonstrates that AI-driven multi-agent systems can enrich real-time communication with senti
ment analysis, summarization, and productivity tools.
• Conclusion: The project met objectives by building a functional, scalable system with hybrid AI (rule
based + API-driven).
• Future Work:– Train a custom Roman Urdu sentiment model for higher accuracy.– Expand summarization with domain-specific fine-tuned transformers.– Add advanced agents (Focus, Wellness, Knowledge Builder) with microservice orchestration.– Optimize performance for large-scale deployment.
10