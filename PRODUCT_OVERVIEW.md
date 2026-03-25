# Sylk — Product Overview
## Built by Moretti Labs | David Moretti

### What Sylk Is

Sylk is an AI-powered operations platform for service businesses — construction contractors, plumbers, electricians, pest control companies, cleaning services, landscapers, and any trade that manages projects, crews, and clients. It replaces the patchwork of spreadsheets, group texts, and disconnected apps that most service businesses use to run their operations.

At its core, Sylk has an AI operations partner called Foreman that understands the service business world. Owners talk to Foreman in plain language — "create a kitchen remodel for the Smiths at 123 Oak St" or "how much does Jose owe me this week" — and Foreman handles the rest. It creates projects with phases and timelines, generates estimates, tracks expenses, manages crews, and flags problems before they become expensive. The entire system works in English, Spanish, and Portuguese, with voice input so workers on job sites can use it hands-free.

### Core Capabilities

**Project Management**
- AI-powered project creation from natural language descriptions
- Work sections (phases) with tasks, timelines, and progress tracking
- Drag-and-drop task reordering and cross-section task movement
- Recurring daily tasks with quantity tracking for operational logging
- Demo project for new users to learn the system

**Service Plans (Recurring Services)**
- Service plan creation for recurring businesses (pest control, cleaning, lawn care, pool, HVAC)
- Location management with addresses, access notes, and contact info
- Recurring schedules (weekly, biweekly, monthly) with preferred times
- Visit checklist templates per location
- Daily route management with ordered stops
- Route builder for assigning visits to workers
- Billing preview and one-tap invoice generation from completed visits
- One-shot creation through AI chat — plan, location, schedule, and checklist in one save

**Estimates & Invoices**
- AI-generated estimates with data-backed pricing from past projects
- Editable estimate cards with line items, quantities, and totals
- One-tap estimate-to-invoice conversion
- Invoice tracking with payment status (unpaid, partial, paid, overdue)
- SMS and WhatsApp estimate sharing
- PDF generation and document sharing

**Financial Management**
- Per-project expense and income tracking
- Receipt scanning via camera — AI extracts vendor, amount, and category automatically
- Company overhead tracking with monthly recurring expenses
- Tax summary with IRS Schedule C categories and 1099 contractor identification
- Accounts receivable aging report (current, 30, 60, 90+ days)
- Payroll summary with worker-by-worker breakdown
- Cash flow analysis with 6-month trailing view
- Profit & loss reporting

**Bank Integration**
- Real-time bank connection via Teller with mTLS certificate authentication
- Apple Wallet-style gradient cards for connected bank accounts
- Automatic transaction reconciliation — matches bank charges to recorded expenses
- Intelligent transaction classification with learning rules
- Overhead matching for recurring business expenses
- CSV import for banks without API support

**Crew Management**
- Worker profiles with trade, payment type (hourly, daily, weekly, project-rate)
- GPS-tracked clock-in/clock-out with human-readable addresses
- Time tracking with manual entry and editing
- Worker schedule management and project assignments
- Supervisor portal with delegated project oversight
- Worker mobile app with clock-in, task completion, and daily reports
- Payment summaries with daily breakdown

**Daily Reports**
- Structured daily logs: work performed, photos, weather, manpower, materials, equipment, delays, safety observations
- Recurring daily task checklist integration with quantity inputs
- Photo upload to Supabase storage
- Report history with project and date filtering

**Scheduling & Calendar**
- Work schedule creation and management
- Calendar integration with task distribution
- AI-powered task scheduling that respects working days and trade sequencing
- Appointment management with location-aware popups

**Dashboard**
- 17 customizable widgets with unique gradient designs
- Drag-and-drop widget reordering with resize options
- Company overhead card with health indicators
- Active projects overview, overdue invoices, payroll, cash flow
- Pipeline view (estimates → invoices), profit margin, recent reports

**Notifications**
- Push notification system via Expo
- In-app notification center with type filtering
- Real-time updates via Supabase subscriptions
- Bank reconciliation alerts (delta-based — shows only new transactions)
- Appointment reminders, daily report submissions, project warnings

**Onboarding**
- Animated walkthrough slides showcasing features
- Spotlight coach marks with frosted glass tooltips
- AI-powered service and trade selection
- Business info, pricing, and invoice setup flow
- Premium onboarding with paywall integration

**Internationalization**
- Full translation in English, Spanish, and Brazilian Portuguese
- Voice input in all three languages
- AI responds in the user's selected language

**Document Management**
- Project document upload and organization
- PDF viewer integrated in app
- Google Drive integration for document backup
- AI-powered document analysis (PDFs, Word docs, receipts)

### Foreman AI Agent

Foreman is the AI operations partner at the center of Sylk. It's not a chatbot — it's an agent that can read, write, and analyze every part of the business.

**Intelligence Architecture:**
- 60 specialized tools spanning projects, estimates, invoices, workers, scheduling, financials, bank reconciliation, documents, and service plans
- Intent-based tool routing: analyzes each message to determine intent (financial, project, worker, scheduling, etc.) and filters 60 tools down to 8-12 relevant ones per query
- Smart model selection: uses faster models for simple queries, more capable models for complex multi-step analysis
- Request memory: caches tool results for 30 minutes to avoid redundant queries within a conversation
- Long-term memory: learns facts about the business ("Jose is certified for electrical", "always add 15% contingency") and applies them to future conversations

**What Foreman Can Do:**
- Create projects from natural language descriptions with phases, tasks, timelines, and budgets
- Create service plans with locations, schedules, and checklists in one conversation
- Generate estimates with pricing pulled from the owner's past projects
- Record expenses from receipt photos (extracts vendor, amount, category via vision)
- Clock workers in and out, check schedules, assign workers to projects
- Query financials: "who owes me money?", "what are my tax deductions?", "how's my cash flow?"
- Manage daily routes for service businesses: "what's my route today?"
- Track recurring daily task quantities: "how much fiber did we lay this week?"
- Upload and analyze project documents (PDFs, contracts, blueprints)
- Reconcile bank transactions: "assign that Home Depot charge to the Smith project"
- Surface insights: flags overdue invoices, over-budget projects, scheduling gaps, and unbilled work

**Communication Style:**
- Speaks like a sharp operations manager, not a corporate assistant
- Leads with numbers and actionable information
- Adapts to the specific business type (construction vs. cleaning vs. pest control)
- Responds in the owner's language (English, Spanish, Portuguese)

### Technical Architecture

**Stack:**
- Frontend: React Native (Expo SDK 54) — iOS and Android from one codebase
- Backend: Node.js/Express deployed on Railway
- Database: Supabase (PostgreSQL) with Row Level Security
- AI: OpenRouter (Claude, GPT models) with Groq for fast inference
- Payments: Stripe subscriptions with Apple App Store compliance
- Banking: Teller (mTLS) and Plaid for bank connections
- Voice: Deepgram and Groq Whisper for speech-to-text
- Storage: Supabase Storage for photos and documents
- Maps: Google Maps API for geocoding and worker location tracking
- Push: Expo Push Notifications via Supabase Edge Functions

**Key Architectural Decisions:**
- Service role Supabase client on backend — all queries manually enforce ownership filtering for security
- Agent tool system with parallel execution and deduplication caching
- Streaming responses with Server-Sent Events for real-time AI output
- Background job processing for long-running AI tasks with client reconnection
- Three-role system (owner, supervisor, worker) with distinct navigation stacks and permission models
- Material top tabs with custom animated navigation bars (LumaBar)

### Build Stats
- Lines of code: 529,427
- Source files: 773
- AI tools: 60
- App screens: 107
- API endpoints: 93
- Backend routes: 11
- Database tables: 38+
- Build period: November 2025 — March 2026 (5 months)
- Total commits: 217
- Solo developer: David Moretti, age 20, Brazil
