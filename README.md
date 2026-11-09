# GitHub Portfolio Analyzer

A React application that reviews a public GitHub profile, calculates six heuristic portfolio scores, and suggests improvements. Built-in feedback works without an AI key. Scores are project-specific rules, not validated recruiter assessments or measures of engineering ability.

## Run locally

Requires Node.js 20.19+ in the 20.x series, or 22.12+ (Vite 7 requirements), and npm.

```bash
npm ci
npm run dev
```

Open the URL printed by Vite. Enter a GitHub username or a profile URL such as `https://github.com/octocat`. Repository URLs are not accepted.

```bash
npm test         # Regression tests using Node's test runner
npm run build   # Production files in dist/
npm run preview # Preview the production build locally
```

## Data and scoring

The application calls the GitHub REST API from the browser. It paginates public owned repositories, separates forks, and selects up to 10 original repositories by stars, breaking ties by most recent push. For each selected repository it requests the README, language statistics, and up to 20 recent commits. Activity uses up to 100 recent public events.

| Dimension | Weight | Signals |
| --- | --- | --- |
| Documentation | 25% | README length, sections, links and visuals |
| Activity and consistency | 20% | Public event recency, observed push days, active weeks and consecutive push days |
| Commit quality | 15% | Sampled message text, conventional prefixes and commit counts |
| Repository organization | 15% | Descriptions, topics, licenses, homepages and original repositories |
| Technical depth | 15% | Language bytes, repository sizes, stars and open issues |
| Profile completeness | 10% | Public profile fields and follower count |

The overall score is the rounded weighted sum. The UI also shows README checks, language totals for sampled repositories, profile checks, suggestions for pinning or archiving, and a proposed two-week improvement plan. It does not modify GitHub repositories or profiles.

## Feedback and optional integrations

Without provider keys, feedback comes from local rules. With configured keys, the app tries Gemini, Groq, then Anthropic, and falls back to local rules when requests fail or responses are invalid. The review heading identifies built-in versus provider-generated feedback. Responses arrive as complete JSON; they are not streamed.

For private local experiments, copy `.env.example` to `.env`, fill only the variables you need, and restart Vite:

- `VITE_GITHUB_TOKEN`: optional authenticated GitHub requests.
- `VITE_GEMINI_API_KEY`: optional Gemini integration.
- `VITE_GROQ_API_KEY`: optional Groq integration.
- `VITE_ANTHROPIC_API_KEY`: optional direct Anthropic integration.

**All `VITE_*` values are embedded in browser code and visible to visitors.** This repository has no backend secret storage. Do not deploy private tokens or provider keys in a public build; add a server-side proxy with appropriate access controls first. Build without credentials for a public static deployment. An existing `.env` also affects production builds.

Provider availability, model access, quotas, pricing and browser access depend on the provider. Configuring a key does not guarantee a successful AI response. When enabled, providers receive a summary of public profile fields, repository metadata, sample commit messages and computed scores. Google Fonts is loaded for typography.

## Limitations

- Public data only; private contributions and repositories are excluded.
- Public events are a limited sample, not the GitHub contribution graph or a complete 90-day history. Missing events cannot establish how long someone has been inactive.
- Commits are sampled from repository default branches and may include other contributors. Counts do not establish commit atomicity or personal productivity.
- Size, languages, stars and README patterns are approximate signals. The app does not inspect source code, run tests in analyzed repositories, or verify demos and screenshots.
- Optional detail requests can fail. Unavailable READMEs are labeled, but incomplete data can still lower scores. GitHub rate limits can prevent analysis, especially across repeated searches.
- Suggestions are generated advice. Score increases, hiring outcomes and completion times are not guaranteed.

## Project structure

```text
src/App.jsx       React interface and analysis state
src/analyzer.js   GitHub requests, scoring and feedback
src/main.jsx      React entry point
test/            Regression tests
index.html        Document entry point
vercel.json       Vercel SPA routing configuration
```

Uses React 19 and Vite 7 with inline styles and no UI component library. Production output can be served as static files. No license file is currently included in this repository.
