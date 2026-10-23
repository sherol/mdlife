# mdlife – Markdown Life & Skills Vault

A markdown-first personal operating system and agent-skills repository that uses your **Google Drive** as its storage layer.

Manage goals, projects, agent skill templates, and interconnected notes in a distraction-free editor, with no proprietary lock-in.

Live: https://sherol.github.io/mdlife (offline demo without Google login: https://sherol.github.io/mdlife/mock.html)

---

## Features

- **Google Drive storage**: Your personal Google Drive (`/Markdown Life Vault/`) is the authoritative storage backend. No proprietary database.
- **Drive sync**:
  - Edits are auto-saved to Drive (debounced) and backed up to browser `localStorage` so unsaved work is never lost.
  - Create, rename, and delete files directly within your Drive folder hierarchy.
  - Reload from Drive and initialize the starter templates on demand.
  - Share a project folder with another Google account.
  - If a file changed in Drive since you last loaded it, your version is saved and Drive's version is kept next to it as `<name> (conflict).md`.
  - Works offline: edits stay in the browser and sync when the connection (or Google session) is back. You can also skip sign-in and use local-only mode.
- **Sidebar & file management**:
  - Numbered top-level folders (**0. Trailhead**, **1. Goals**, **2. Projects**, **3. Agent Skills**, **4. Notes**, **5. Archive**), a folder filter, and search across names, tags and content.
  - Add a project sub-folder or an archive year, create files in a folder, download a single file.
  - Rename `.md` files from the sidebar or the editor pane; `[[wiki-links]]` referencing a renamed file are updated across the vault.
- **Life Matrix**:
  - Connect **Goals** to **Projects**, **Agent Skills**, and **Notes** with YAML frontmatter and `[[wiki-links]]`.
  - Status chips, priority, target dates, and task-completion progress.
- **Agent Skills Lab**:
  - Markdown specs for LLM agent prompts with frontmatter parameters.
  - **Skill Playground** fills in `{{variables}}` and assembles the final prompt for you to copy into the LLM of your choice (it does not call a model itself).
- **Markdown editor & preview**:
  - Editor, split, or preview-only view, with a formatting toolbar (headings, bold/italic, lists, checklists, quotes, code blocks, tables, links).
  - `[[wiki-links]]` with a file picker in the toolbar; links open the target note, and each note lists its **backlinks**.
  - Type `@today` (or use the toolbar button) to insert today's date.
  - Interactive checklists (click a checkbox in the preview to update the source).
  - GitHub-flavored markdown (tables, task lists, strikethrough), code blocks, blockquotes, and a frontmatter badge viewer.
  - Mermaid diagrams: a ```` ```mermaid ```` code block is drawn as a diagram in the preview (flowcharts, sequence diagrams, Gantt charts, mind maps, …), following light/dark mode. A diagram with a mistake shows its code and Mermaid's error. The Mermaid library loads only when a note with a diagram is opened.
- **Import / export**:
  - Drag and drop local `.md` files into the sidebar (or use the import button) to import them.
  - Import a Google Doc as a markdown note (pick it with the Google Picker or paste its URL).
  - Download the entire vault as a `.zip` file.
- **0. Trailhead**: The first folder in the sidebar. Its `start.md` is the vault's home page: the app opens on it at every login and edits like any other note, it's created automatically when missing, and it can't be deleted or renamed. Edit it into your own map of the vault; other notes can live in the folder too.
- **Edit together via Google Docs**: Share any note as a Google Doc (button "Edit in Google Docs" in the editor). You keep editing in mdlife; someone else edits the Google Doc. Changes sync both ways (on save, when the note is opened, and every 30 seconds while it's open); edits to different parts are merged automatically, and if you both change the same lines mdlife asks which to keep. The note's metadata stays in mdlife. Simple formatting (headings, bold/italic, lists, checklists, links, tables) round-trips; Docs-only formatting (colors, fonts, images) may be dropped when saving from mdlife.
- **Backup**: The backup button in the header saves a snapshot of every file (including edits not yet synced) to `backup/<date time>/` inside your Google Drive vault folder, keeping the folder structure. Snapshots are never loaded back into the vault and are never changed afterwards; restore by copying files back in Drive or importing them.
- **SheetSync sheet in Notes**: the sheet button on **4. Notes** (or **Import SheetSync sheet** in the New File dialog) lets you pick your [SheetSync](https://sherol.github.io/sheetsync/) spreadsheet with the Google Picker and adds a note for it. Opening the note shows the sheet's tabs and entries, with search, and a form to edit or add entries; the form uses SheetSync's field types (dates, ratings, choices). Edits go straight to the Google Sheet, changing only the cells you edit. Picking the sheet grants mdlife access to that one spreadsheet only.
- **Dark mode**: Follows your system theme by default; the header toggle cycles System → Light → Dark.
- **GitHub Pages ready**: GitHub Actions workflow (`.github/workflows/deploy.yml`) builds and publishes the static site.

### Keyboard shortcuts

| Shortcut           | Action                       |
| ------------------ | ---------------------------- |
| `Ctrl+S` / `Cmd+S` | Save unsaved edits to Drive  |
| `Ctrl+K` / `Cmd+K` | Open the quick file switcher |
| `Ctrl+B` / `Cmd+B` | Bold (in the editor)         |
| `Ctrl+I` / `Cmd+I` | Italic (in the editor)       |

---

## Vault directory structure

The starter vault (`src/data/initialVault.ts`) is organized like this, both in Google Drive and in ZIP exports. The sidebar shows the top-level folders with their numbered labels (`trailhead/` is **0. Trailhead**, `goals/` is **1. Goals**, and so on).

```text
Markdown Life Vault/
├── trailhead/
│   └── start.md            (home page, created when missing)
├── goals/
│   ├── ai-systems-mastery.md
│   ├── endurance-vitality.md
│   └── financial-independence-engine.md
├── projects/
│   ├── autonomous-research-agent/
│   │   └── autonomous-research-agent.md
│   ├── half-marathon-sub-1h45/
│   │   └── half-marathon-sub-1h45.md
│   └── second-brain-pkm/
│       └── second-brain-pkm.md
├── skills/
│   ├── research-synthesizer.md
│   ├── code-architect.md
│   ├── deep-work-planner.md
│   └── prompt-evaluator.md
├── notes/
│   └── weekly-review-protocol.md
├── archive/
│   └── 2025/
│       └── 2025-annual-retrospective.md
└── backup/                 (Drive only: snapshots from the Backup button, never loaded as notes)
```

### File format example

Each markdown file uses YAML frontmatter:

```markdown
---
title: Autonomous Research Agent Engine
category: projects
status: in-progress
priority: high
target_date: 2026-10-30
goal_id: ai-systems-mastery.md
tags:
  - agents
  - automation
assigned_skills:
  - research-synthesizer.md
---

# Autonomous Research Agent Engine

Parent Goal: [[ai-systems-mastery.md]]

- [x] Define Markdown input/output schemas for agent report format
- [ ] Add claim extraction and verification step
```

---

## Tech stack

- **Framework**: React 19 + Vite 8
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Markdown rendering**: `react-markdown` + `remark-gfm` (frontmatter is parsed by a small built-in parser), Mermaid for diagrams (loaded on demand)
- **Authentication**: Firebase Authentication (Google Sign-In)
- **Google APIs**: Drive REST API v3 (storage, sharing, backups), Docs API (Google Doc import), Sheets API v4 (SheetSync), Google Picker
- **Merging**: `node-diff3` (three-way merge for notes edited in Google Docs)
- **ZIP export**: JSZip
- **Icons**: Lucide React
- **Tooling**: ESLint (typescript-eslint, react-hooks), Prettier, Vitest

---

## Getting started

### Prerequisites

- Node.js 22+
- npm (the lockfile is `package-lock.json`; CI uses `npm ci`)

### Local development

```bash
git clone https://github.com/sherol/mdlife.git
cd mdlife
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Open `/mock.html` to explore with sample files without signing in (mock mode keeps its data under separate `mock_` localStorage keys and never talks to Google).

### Configuration

`firebase-applet-config.json` holds the Firebase project and Google OAuth client the app signs in with; the Picker also uses its `messagingSenderId` as the Google Cloud app ID. To run against your own project, replace it with your Firebase web app config and enable the **Google Drive API**, **Google Docs API**, **Google Sheets API** and **Google Picker API** in that Google Cloud project.

### Scripts

| Script              | Description                            |
| ------------------- | -------------------------------------- |
| `npm run dev`       | Start the Vite dev server on port 3000 |
| `npm run build`     | Build the static site into `dist/`     |
| `npm run preview`   | Preview the production build locally   |
| `npm run typecheck` | Type-check with `tsc --noEmit`         |
| `npm run lint`      | Lint with ESLint                       |
| `npm run format`    | Format files with Prettier             |
| `npm test`          | Run unit tests with Vitest             |
| `npm run clean`     | Remove `dist/`                         |

---

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` type-checks, lints, tests, builds, and deploys on every push to `main` (or `master`). `.github/workflows/ci.yml` runs the same checks on pull requests and other branches.

### Step 1: Enable GitHub Actions for Pages

1. Go to your repository on GitHub.
2. Navigate to **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.

### Step 2: Configure Google OAuth / Firebase for your GitHub Pages domain

To enable Google Sign-In on your published GitHub Pages URL (e.g. `https://<your-username>.github.io`):

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) or [Firebase Console](https://console.firebase.google.com/).
2. In **Firebase Authentication** → **Settings** → **Authorized domains**, add `<your-username>.github.io`.
3. In **Google Cloud Console** → **APIs & Services** → **Credentials** → your Web OAuth client, add `https://<your-username>.github.io` under **Authorized JavaScript origins**.

---

## Privacy & permissions

- The app requests these Google scopes:
  - `drive.file`: read and write **only the files the app created or that you picked** with the Google Picker (the vault, shared Google Docs, your SheetSync sheet). It cannot read or change your other Drive files.
  - `drive.metadata.readonly`: file names and details (not contents).
  - `documents.readonly`: read a Google Doc you import.
- No vault contents are stored on any external server. All API calls go directly from your browser to Google APIs; the vault is also cached in your browser's `localStorage`.

---

## Project structure

```text
index.html, mock.html     App entry and offline demo entry (src/main.tsx, src/mock-main.tsx)
firebase-applet-config.json
src/
├── App.tsx               App state, file operations, layout
├── components/           Sidebar, header, editor, preview, Mermaid, views and modals
├── hooks/                useDriveSync (serialized Drive save queue, Google Doc sync), useRefState
├── data/initialVault.ts  Starter vault
├── utils/                Drive/Docs/Sheets clients, auth, markdown parsing, storage, theme
└── types.ts
.github/workflows/        ci.yml (checks) and deploy.yml (GitHub Pages)
```

---

## License

Copyright 2026 sherol.

Licensed under the [Apache License, Version 2.0](LICENSE). Feel free to fork and customize for your own workflow.
