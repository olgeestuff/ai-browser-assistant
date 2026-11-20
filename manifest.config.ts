import { defineManifest } from "@crxjs/vite-plugin";

// Least-privilege permissions (Security & Privacy requirements):
// - activeTab + scripting: only act on the tab the user is currently looking
//   at, only when invoked — no broad host_permissions, no background polling.
// - storage: settings + local task history (chrome.storage.local only).
// - identity: Google OAuth token for Sheets/Drive, scoped to drive.file
//   (files this app creates) rather than full Drive access.
// - downloads: optional user-requested downloads (FR-019).
export default defineManifest({
  manifest_version: 3,
  name: "AI Browser Assistant (Personal)",
  description:
    "Personal, AI-agnostic assistant that reads and acts on the page you're looking at, with confirmation before anything consequential.",
  version: "0.1.0",
  icons: {
    16: "public/icons/icon16.png",
    32: "public/icons/icon32.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  action: {
    default_title: "AI Browser Assistant",
    default_icon: {
      16: "public/icons/icon16.png",
      32: "public/icons/icon32.png",
      48: "public/icons/icon48.png",
      128: "public/icons/icon128.png",
    },
  },
  background: {
    service_worker: "src/background/background.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle",
    },
  ],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  options_page: "src/options/index.html",
  permissions: ["activeTab", "scripting", "storage", "identity", "sidePanel", "downloads"],
  host_permissions: [
    "https://api.anthropic.com/*",
    "https://sheets.googleapis.com/*",
    "https://www.googleapis.com/*",
  ],
  oauth2: {
    // Replace with your own OAuth 2.0 Client ID (type "Chrome App") from
    // Google Cloud Console — see README "Google Cloud setup". This value is
    // tied to your Google account/project; nobody else's key will work here,
    // and this one is safe to commit (OAuth client IDs are not secrets).
    client_id: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.file"],
  },
});
