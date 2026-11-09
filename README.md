# 🔍 GitHub Portfolio Analyzer & Enhancer

> See your GitHub the way recruiters do. Get a score, AI-powered insights, and a clear roadmap to stand out.

![GitHub Portfolio Analyzer](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Claude AI](https://img.shields.io/badge/Claude_AI-Powered-D4A574?logo=anthropic&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)


---

## 🧠 What It Does

Paste any GitHub username or profile URL → get an instant recruiter-grade analysis in under 30 seconds.

**The tool analyzes:**

- Public repositories, READMEs, and documentation quality
- Commit activity patterns and consistency
- Code structure, topics, descriptions, and licensing
- Language diversity and technical depth
- Stars, forks, followers — real-world impact signals

**Then delivers:**

- 📊 **Portfolio Score** — overall + 5 individual dimensions (0–100)
- 🎯 **AI Recruiter Verdict** — what a recruiter thinks in 30 seconds
- ✦ **Strengths & Red Flags** — specific to your profile, not generic
- 🛤️ **Prioritized Action Plan** — 5 steps with repo-level recommendations
- 👤 **Recruiter Impression** — the honest first-impression summary

---

## 📸 Screenshots

<!-- Add your screenshots here -->
<!-- ![Home](./screenshots/home.png) -->
<!-- ![Results](./screenshots/results.png) -->
<!-- ![AI Analysis](./screenshots/ai-analysis.png) -->

---

## ⚙️ Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite |
| Styling | Inline CSS (zero dependencies, dark theme) |
| APIs | GitHub REST API (public, no auth) |
| AI Engine | Anthropic Claude API (recruiter analysis) |
| Fonts | DM Sans + JetBrains Mono (Google Fonts) |

**Zero external UI libraries.** No Tailwind, no component library — everything is hand-crafted for a clean, developer-native experience.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/shreykumarsingh/GitHub-Portfolio-Analyzer.git
cd GitHub-Portfolio-Analyzer
npm install
cp .env.example .env
npm run dev
```

### Environment Configuration (Optional)

All features work out-of-the-box with the built-in analyzer. For live LLM evaluation or increased GitHub rate limits, configure `.env`:

```env
# Free Option 1: Google Gemini Flash (Free tier at https://aistudio.google.com)
VITE_GEMINI_API_KEY=your_gemini_api_key

# Free Option 2: Groq Cloud (Free tier at https://console.groq.com)
VITE_GROQ_API_KEY=your_groq_api_key

# Optional: GitHub Personal Access Token (raises rate limit from 60 to 5,000 req/hr)
VITE_GITHUB_TOKEN=your_github_token
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📐 Scoring System

The portfolio score is computed across **5 dimensions**, each weighted to reflect what recruiters actually look for:

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Documentation** | 25% | README quality, length, sections (install, usage, screenshots, tech stack) |
| **Activity & Consistency** | 20% | Push frequency, unique active days, recent commit activity |
| **Code Quality & Structure** | 20% | Descriptions, topics, licensing, original (non-forked) repos, multi-language repos |
| **Impact & Reach** | 15% | Stars, forks, followers, number of original projects |
| **Technical Depth** | 20% | Language diversity, project size variety, bio & blog presence |

Each dimension scores 0–100. The **overall score** is the weighted average.

---

## 🤖 AI Analysis

The tool sends a structured profile summary to **Claude AI** (Anthropic), which responds with:

- A one-line **recruiter verdict** — specific to your profile
- **3 strengths** recruiters would notice
- **3 red flags** that might raise concerns
- **5 prioritized recommendations** (high / medium / low) with specific repo-level advice
- A **30-second recruiter impression** — the honest takeaway

The AI prompt is engineered to avoid generic advice and instead reference your actual repos, languages, and patterns.

---

## 🏗️ Architecture

```
src/
├── App.jsx          # Entire application — single file, clean components
└── main.jsx         # React entry point
```

**Design decisions:**

- **Single-file architecture** — no unnecessary abstraction, everything readable in one scroll
- **No auth tokens** — uses public GitHub API (60 req/hr, sufficient for analysis)
- **Progressive loading** — scores render instantly, AI analysis streams in background
- **Responsive** — works on desktop and mobile

---

## 📋 Hackathon Requirements Checklist

| Requirement | Status |
|-------------|--------|
| Accepts GitHub profile URL as input | ✅ |
| Fetches public data from GitHub | ✅ |
| Generates structured Portfolio Score | ✅ (5 dimensions + overall) |
| At least 3 actionable improvement suggestions | ✅ (5 AI-generated, prioritized) |
| Clean, user-friendly interface | ✅ (dark theme, animated, developer-native) |
| Working prototype (not mockup) | ✅ |
| Scoring system with clear metrics | ✅ |
| Specific feedback (not generic) | ✅ (repo-level, AI-powered) |
| Demo video | ✅ (linked above) |

---

## 🎨 Design Philosophy

- **Dark-first** — built for developers who live in dark mode
- **Minimal but complete** — every pixel earns its place
- **Developer-native** — JetBrains Mono for data, DM Sans for readability
- **Animated feedback** — score rings, staggered fade-ins, progress bars
- **Cyan accent system** — clean, modern, non-generic

---

## 📝 License

MIT — use it, fork it, improve it.

---

<p align="center">
  <i>Because your GitHub should open doors, not close them.</i>
</p>
