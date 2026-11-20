# AI Browser Assistant (Personal)

A personal, installable Chrome extension that accepts natural-language instructions and
reads/acts on the page currently open in your browser — like Claude in Chrome, but
AI-provider-agnostic and built around your own Google Sheets/Drive for records and files.

Built against the Personal AI Browser Assistant Requirements Pack (v1.0). Status: **MVP** —
FR-001 through FR-013 and FR-017–FR-023 implemented; FR-024/FR-025 (remote browser mode,
multi-user) are explicitly out of scope for now.

## What it does

- Opens as a Chrome **side panel** with a chat-style interface.
- On your command, reads the **current tab's** visible text (or just your selection).
- Converts your instruction into a **structured action plan** via an AI provider, shown to
  you in plain language before anything runs.
- Executes safe actions (click, fill, select, navigate) only after you confirm the plan.
- **Always** requires an extra, per-step confirmation before anything consequential: submit,
  send, purchase, delete, publish — regardless of what the model thinks is "safe".
- Lets you **stop** a running task at any point; nothing further executes.
- Logs task summaries to a Google Sheet you own (never raw page content), and can save
  screenshots to a Google Drive folder you own.
- Swaps AI providers through one adapter interface — see `src/providers/`. Ships with
  **Anthropic (Claude), OpenAI (ChatGPT), Google (Gemini), OpenRouter, and Abacus AI
  (RouteLLM)**, selectable in Settings.
- Lets you **attach an image** (screenshot, photo, document scan) to a chat message for
  vision-capable models to use as context.

## Architecture (maps to the requirements doc)

| Component | File(s) | Requirement |
|---|---|---|
| Manifest V3 extension shell | `manifest.config.ts` | FR-001 |
| Side panel chat UI | `src/sidepanel/` | FR-002 |
| Content script: page read + DOM actions | `src/content/` | FR-003, FR-004, FR-005, FR-008 |
| AI provider adapters (Anthropic, OpenAI, Gemini, OpenRouter, Abacus AI) | `src/providers/` | FR-006, FR-013 |
| Action schema + validation | `src/lib/actionSchema.ts` | FR-009, FR-010 |
| Task orchestrator (plan, confirm, execute, stop) | `src/background/taskRunner.ts` | FR-009–FR-012 |
| Settings (provider, key, Sheet/Drive IDs) | `src/options/` | FR-014 |
| Local task history | `src/lib/storage.ts` | FR-015 |
| Google Sheets task/file logging | `src/lib/google.ts` | FR-020, FR-021 |
| Screenshot capture → Drive | `src/background/taskRunner.ts#captureAndSaveScreenshot` | FR-017, FR-018 |

**Design decision vs. the doc's default:** the doc's "likely implementation" column
suggests Google Apps Script as a backend for Sheets/Drive. This build instead calls the
Sheets and Drive REST APIs **directly from the extension**, authenticated via
`chrome.identity.getAuthToken`. Reasoning (this was a Developer-owned decision, OD-07):
no server to deploy, secure, or keep patched; no publicly-reachable endpoint to accidentally
leave writable (AC-10); and the OAuth token is scoped only to `spreadsheets` and
`drive.file` (files this app creates — not your whole Drive). Apps Script remains a fine
option later if you want server-side logic Sheets/Drive APIs can't do alone.

## Install (developer mode)

```bash
npm install
npm run build
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** (top right) → **Load
unpacked** → select this project's `dist/` folder.

For live-reloading while you work on it: `npm run dev`, then load `dist/` the same way once
and leave it loaded — crxjs hot-reloads the built files.

## Configuration

Open the extension's **Settings** (gear icon in the side panel, or right-click the toolbar
icon → Options).

### 1. AI provider (BYOK)

Pick a provider in Settings and paste in your own API key for it. The key is stored only in
`chrome.storage.local` on this device — never synced, never sent to any server of ours, only
sent directly to that provider's own API when you ask the assistant to do something.

| Provider | Get a key at | Notes |
|---|---|---|
| Anthropic (Claude) | console.anthropic.com → API Keys | Default model `claude-sonnet-4-5` |
| OpenAI (ChatGPT) | platform.openai.com → API keys | Default model `gpt-4o` |
| Google (Gemini) | aistudio.google.com → Get API key | Default model `gemini-2.5-pro` |
| OpenRouter | openrouter.ai → Keys | Model field accepts any slug from openrouter.ai/models |
| Abacus AI (RouteLLM) | RouteLLM API page in your Abacus AI / ChatLLM account | `route-llm` auto-picks a model, or name one directly |

All five implement the same `AiProvider` interface (`src/providers/types.ts`) and go through
the same structured-output schema (`src/providers/planSchema.ts`), so the task orchestrator,
content script, and UI never know which vendor is in use.

### 2. Google Cloud setup (required for Sheets/Drive logging)

Because this calls Google APIs directly with your own OAuth consent (no shared backend),
you need a one-time OAuth client tied to your own Google account:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create (or pick) a project.
2. **APIs & Services → Library** → enable **Google Sheets API** and **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → set it up for your own account (External +
   "Testing" mode with yourself as a test user is fine for personal use).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → type
   **Chrome Extension** → paste in your extension's ID (visible on `chrome://extensions`
   once you've loaded it unpacked once — it's stable as long as you don't move the folder).
5. Copy the generated Client ID into `manifest.config.ts` → `oauth2.client_id`, then
   `npm run build` and reload the extension.

This client ID is **not a secret** (OAuth client IDs for installed/Chrome apps are public by
design — the actual authorization happens via the user's own Google sign-in consent), so it's
fine to commit it to this repo.

### 3. Google Sheet

Create a blank Google Sheet, copy the ID from its URL, paste it into Settings → "Google
Sheet ID". The extension creates `Tasks` and `Files` tabs automatically on first use.

### 4. Google Drive folder (optional)

Leave blank to save to the root of My Drive, or paste a folder ID to keep things tidy.

## Permissions requested, and why

- `activeTab` + `scripting` — only the tab you're on, only when you invoke the assistant.
  No broad `host_permissions` for arbitrary site access.
- `storage` — settings + local task history, local only.
- `identity` — Google OAuth token for Sheets/Drive, scoped to `spreadsheets` + `drive.file`.
- `downloads` — for the optional download/export workflow (FR-019).
- `host_permissions` for `api.anthropic.com`, `sheets.googleapis.com`, `googleapis.com` only.

The content script runs on all `http(s)` pages but is **passive**: it does nothing until the
background script messages it in direct response to something you typed. It never polls,
observes, or transmits a page on its own.

## Testing

Manual test matrix to run before trusting a change:

1. **Ordinary static site** (e.g. a Wikipedia article): ask "summarize this page" → confirm
   a read-only answer comes back with no page changes.
2. **A form-heavy site** (e.g. a contact form on a site you control): ask "fill in the name
   field with Test User" → confirm the plan preview appears, run it, confirm the field is
   filled, confirm no submission happens without a second, explicit confirmation.
3. **Stop mid-task**: start a multi-step instruction, click Stop after step 1 completes,
   confirm no further steps execute and the task shows "stopped".
4. **Sensitive action gating**: ask it to click a "Submit"/"Send"/"Delete" button → confirm
   it pauses with a highlighted per-step confirmation before doing so.
5. **Unsupported page**: try a page behind a login wall or a canvas-heavy app (e.g. a
   complex web app with no accessible DOM) → confirm it reports the limitation instead of
   fabricating success (AC-13).
6. **Provider swap**: switch providers in Settings (Anthropic/OpenAI/Gemini/OpenRouter/Abacus
   AI) with the matching API key, and confirm a plan still generates correctly.
7. **Image attach**: click "🖼 Attach image" in the composer, pick a photo, and ask a
   question about it (e.g. "what does this say?") — confirm the model's answer reflects
   the image content.

## Known limitations (MVP)

- One active task at a time (by design — it's a personal single-tab assistant, not a fleet).
- Five providers are implemented (Anthropic, OpenAI, Gemini, OpenRouter, Abacus AI); adding
  another is one new file in `src/providers/` plus one registry line in
  `src/providers/index.ts`.
- Image attachments are sent as part of a single chat message (no multi-turn image history
  yet) and are capped at 5MB client-side.
- No Playwright / remote-browser mode (FR-024) — local tab only.
- No Chrome Web Store packaging/signing yet — developer-mode install only (FR-001's second
  half, distributable through the Store, is a Phase 6 item per the implementation plan).
- Element targeting is best-effort CSS-selector based; some heavily dynamic or shadow-DOM
  sites may not expose reliable selectors — the assistant will report this rather than guess.
- Does not and will not attempt to bypass CAPTCHAs, paywalls, or access controls.

## Deployment / updates

This is a personal, locally-loaded extension — there is no server deployment step for the
core functionality. To ship an update to yourself: pull the latest commit, `npm run build`,
then on `chrome://extensions` click the reload icon on this extension's card.

Cloudflare Workers/Pages were deliberately **not** introduced (OD-13) — nothing here needs a
public backend yet. If you later want a hosted dashboard over your Sheets data, or need to
move Google API calls server-side, that's the point to revisit Cloudflare Workers.
