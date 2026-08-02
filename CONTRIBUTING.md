# Contributing to Resume Tailor

Thanks for your interest in contributing! This project is local-first and dependency-light by design — please keep that spirit in mind for any changes.

## Workflow

1. **Fork the repo** (or create a branch, if you have write access).
2. **Create a feature branch** off `main`:
   ```bash
   git checkout -b feature/short-description
   ```
3. **Make your changes.** Keep them focused — a bug fix shouldn't bundle in unrelated refactors.
4. **Test locally** before opening a PR:
   ```bash
   npm install
   npm start
   ```
   Walk through the actual flow in a browser (upload a resume, paste a job description, review changes, generate a resume) — there's no automated test suite yet, so manual verification matters.
5. **Open a pull request against `main`.** Describe what changed and why. Direct pushes to `main` are disabled (see below) — all changes go through a PR.

## Ground rules

- **Truthfulness is non-negotiable.** Any change touching resume parsing or tailoring must never let the app invent skills, employers, dates, or achievements that aren't in the user's verified profile. If you're changing `server/tailorEngine.js` or `server/profileExtractor.js`, make sure the validation/sanitization logic still enforces this in code, not just in the prompt.
- **Local-first stays local-first.** Don't introduce a dependency on an external service other than the user's own configured OpenRouter key. No telemetry, no analytics, no silent network calls.
- **Keep dependencies minimal.** This project intentionally uses the Node.js built-in `http` module instead of a framework. Adding a new npm dependency should be a deliberate choice, not a default.
- **Don't commit secrets.** `resume-tailor-data/` (holds your local OpenRouter API key) is gitignored — never remove it from `.gitignore` or commit its contents.

## Reporting bugs / suggesting features

Open a GitHub issue with:
- What you expected to happen vs. what actually happened
- Steps to reproduce (for bugs)
- Relevant console/server log output if you have it

## Branch protection

`main` is protected — direct pushes aren't allowed. All changes, including from maintainers, go through a pull request so changes get reviewed before landing.
