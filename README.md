# Resume Tailor

A local-first, browser-based app that tailors your resume to a specific job description using AI (via [OpenRouter](https://openrouter.ai)) — while enforcing a strict truthfulness rule: it only ever proposes wording built from facts already in your verified career profile. Nothing runs in the cloud except the OpenRouter API calls you explicitly configure; your resume, profile, and API key stay on your machine.

Designed & developed by [Ramgopal Nannapaneni](https://github.com/nannapanenir). Licensed under the [MIT License](LICENSE). Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## What it does

1. **Upload your resume** (PDF or DOCX) — it's parsed into a structured, editable career profile (name, summary, skills, experience, education, certifications).
2. **Paste or upload a job description** — the app compares it against your verified profile and proposes specific, evidence-backed rewrites (never inventing skills, employers, dates, or achievements you don't actually have).
3. **Review each proposed change** — accept, edit, or reject line by line, or accept everything "safe" in one click.
4. **Generate a tailored resume** — download the result as a real `.docx` or `.pdf`, ready to send.

## Requirements

- [Node.js](https://nodejs.org) 18 or later (no other runtime dependencies — everything else installs via npm)
- An [OpenRouter](https://openrouter.ai/keys) API key (free tier models are available) — required for resume parsing and AI-based tailoring

## Installation

```bash
npm install
npm start
```

This starts a local server at **http://localhost:4173** and opens it in your default browser automatically. If port 4173 is already in use, it picks another free port and prints the URL to the console.

## First-time setup

1. Open the app (**http://localhost:4173**).
2. Go to **Settings** in the sidebar and paste in your OpenRouter API key, plus the model you want to use (e.g. a free-tier model like `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`, or any chat-completion model available on OpenRouter). Click **Connect**.
   - The key is written to `resume-tailor-data/settings.json` on disk (file permissions `0600`, readable only by your user) and is never sent anywhere except directly to OpenRouter's API from your own machine.
3. From the welcome screen, click **Add Master Resume** and upload a `.pdf` or `.docx` copy of your resume. The app extracts the text and asks OpenRouter to structure it into your career profile.
4. Open **Career Profile** in the sidebar to review what was extracted. Everything is tagged "Extracted" until you confirm or edit it. Employer names, job titles, dates, and degrees are treated as protected facts — editing them requires an explicit confirmation step.

## Walkthrough: tailoring a resume to a job

1. **Paste or upload a job description** — use the **+** button in the composer, or just paste the JD text directly into the message box at the bottom and press Enter.
2. The app analyzes the JD against your verified profile and reports an **Estimated Resume Relevance** score (before vs. after), plus a list of proposed changes.
3. **Review changes** in the **Changes** tab (opens automatically):
   - **✓ Accept** to use the AI's rewording as-is
   - **✎ Edit** to adjust the wording yourself before accepting
   - **✗ Reject** to keep your original line
   - **Accept All Safe Changes** to bulk-accept everything in one click
   - Every change shows its **Reason** and **Evidence** — the specific fact in your profile that justifies it
4. Check the other tabs as needed:
   - **Keywords** — required/preferred JD keywords, whether each is verified in your profile, and before/after counts
   - **Resume Preview** — the full resume as it will look, with toggles to highlight changed lines/keywords or compare to the original
   - **Match Analysis** — a detailed breakdown of the relevance score
5. Click **📄 Generate ATS Resume** in the Job Match panel (right side). This shows a final validation checklist (lines updated, keywords strengthened, protected facts preserved, relevance score) and lets you download the tailored resume as a real **.docx** or **.pdf** file, named after your candidate name and the job title.
6. **To tailor for another job**, just paste or upload the next job description — this replaces the current tailoring session with a new one while keeping the same verified career profile loaded, so you don't need to re-upload your resume.

> **Note:** Career profile and session data currently live in memory in the browser tab only — refreshing the page clears them, and you'd need to re-upload your resume. Only the OpenRouter API key/model setting persists across restarts (in `resume-tailor-data/settings.json`).

## Project structure

```
Resume Tailor/
├── package.json           # scripts + dependencies (docx, mammoth, pdf-parse, pdfkit)
├── server/                # Node.js backend (built-in http module, no framework)
│   ├── index.js           # HTTP server: static file serving + all /api/* routes
│   ├── dataStore.js        # reads/writes resume-tailor-data/settings.json
│   ├── aiProvider.js        # thin OpenRouter chat-completions client
│   ├── resumeParser.js      # extracts raw text from uploaded PDF/DOCX (+ file-signature checks)
│   ├── profileExtractor.js  # turns raw resume text into a structured profile via OpenRouter
│   ├── tailorEngine.js      # turns (profile + job description) into tailoring suggestions via OpenRouter
│   ├── docxGenerator.js     # renders a tailored profile to a .docx file
│   └── pdfGenerator.js      # renders a tailored profile to a .pdf file
├── public/                # front-end (plain HTML/CSS/JS, no build step, no framework)
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── state.js         # in-memory app state + pub/sub
│       ├── aiClient.js       # front-end wrapper around the /api/* endpoints
│       ├── app.js            # entry point, welcome flow, Career Profile / Settings views
│       ├── chat.js           # chat log + composer, job-description tailoring flow
│       ├── uploadMenu.js     # the "+" menu: resume/LinkedIn/JD upload, manual info entry
│       ├── changeReview.js   # the "Changes" tab: accept/edit/reject controls
│       ├── keywordsTab.js, previewTab.js, matchAnalysisTab.js  # the other workflow tabs
│       ├── jobMatchPanel.js  # right-hand score panel + "Generate ATS Resume" export flow
│       ├── mockData.js       # local keyword-matching fallback engine (used if no AI is configured, or the AI call fails) + shared skill list
│       ├── modal.js, toast.js, sidebar.js, tabs.js  # small UI helpers
└── resume-tailor-data/     # local storage created at runtime
    └── settings.json        # your OpenRouter API key + model (mode 0600)
```

## How AI is used (and how truthfulness is enforced)

- **Resume parsing** (`profileExtractor.js`) and **tailoring** (`tailorEngine.js`) both call OpenRouter with a system prompt that forbids inventing skills, employers, dates, or achievements.
- The server does not just trust the model's output: `tailorEngine.js` re-validates every proposed change against your actual profile before it's ever shown to you — a change is silently dropped unless its "original" text is an exact, verbatim match to a real bullet or summary line in your profile. Employer names, titles, dates, and degrees can never be altered via tailoring.
- If no API key is configured (or an OpenRouter call fails), the app falls back to a local, dependency-free keyword-matching engine (`mockData.js`) that only ever reuses text and skills already present in your profile — it never fabricates content, it just can't propose as nuanced a rewrite as the AI can.

## Troubleshooting

- **"AI provider is not configured yet"** — add your OpenRouter API key and a model name in **Settings**.
- **Upload fails with a file-signature error** — the uploaded file's content doesn't match its extension (e.g. an HTML export renamed to `.pdf`). Re-export/re-save it as a genuine PDF or DOCX and try again.
- **"Could not extract any text from this file"** — likely a scanned/image-only PDF with no embedded text layer (OCR isn't supported). Try a text-based PDF or a DOCX export instead.
- **Port 4173 already in use** — the server automatically falls back to a random free port and prints the new URL to the console.
