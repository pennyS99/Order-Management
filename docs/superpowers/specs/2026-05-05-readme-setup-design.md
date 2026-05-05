# README setup improvements (Windows-only)

Date: 2026-05-05  
Repo: `om-automation` (this workspace)

## Goal

Replace the default Next.js template README with a **Windows (PowerShell) focused** setup guide that reflects how this repo actually runs, including environment configuration, local dev workflow, and common Windows troubleshooting.

## Non-goals

- Do not create a Python `requirements.txt` (this repo is Node/Next.js; no Python toolchain detected).
- No changes to runtime behavior, features, or UI — documentation only.
- No attempt to fully document every internal module; focus on onboarding + day-to-day developer workflow.

## Proposed changes

### 1) Rewrite `README.md` (single source of truth)

The updated README will contain:

- **Project overview**
  - What “OM Automation” is (Next.js app) and a short “what you can do” list (Planner, Shipments, PO Extract, etc. — based on existing routes/components).
- **Prerequisites (Windows)**
  - Node.js + npm (recommend LTS)
  - Git
  - Note: native deps exist (e.g. `sharp`, `@napi-rs/canvas`) and may require a clean `npm install` on first setup.
- **Install**
  - `npm install`
- **Environment variables**
  - Document `.env` and the current `DATABASE_URL="file:./dev.db"` value.
  - Clarify expected behavior if the DB/file doesn’t exist (e.g. created on first use vs required) based on code inspection.
- **Run**
  - `npm run dev`
  - Where it serves (localhost:3000)
- **Quality scripts**
  - `npm run lint`
  - `npm run test`
- **Project structure (high-level)**
  - `src/app` (routes)
  - `src/components`
  - `data/` (local JSON storage pattern used by planner saved plans, etc.)
  - `public/`
- **Dependencies (high-level)**
  - Explain: authoritative dependency list is `package.json` + lockfile.
  - Call out notable runtime deps and why they exist (e.g. `tesseract.js`, `pdf-parse`, `xlsx`, `leaflet/react-leaflet`, `sharp`, `@napi-rs/canvas`).
- **Troubleshooting (Windows)**
  - `npm install` issues with native deps (`sharp`, `@napi-rs/canvas`) and basic remediation steps:
    - remove `node_modules` + reinstall
    - ensure Node LTS
    - rerun install
  - Dev server port conflicts (change port via `PORT=3001 npm run dev` in PowerShell using `$env:PORT=3001; npm run dev`)

### 2) No additional dependency file

Instead of `requirements.txt`/`DEPENDENCIES.md`, dependency information lives in the README to minimize drift and keep onboarding simple.

## Acceptance criteria

- A new developer on Windows can:
  - install dependencies,
  - set up `.env`,
  - run the app locally,
  - and know where to look for core routes/features.
- README content matches the repo’s real scripts/config (`package.json`, `.env`, `next.config.ts`).
- No Python `requirements.txt` is added.

## Risks / mitigations

- **Risk**: README claims behavior about `DATABASE_URL` that isn’t true.  
  **Mitigation**: inspect code paths that use `process.env.DATABASE_URL` (or equivalent) before finalizing wording.

