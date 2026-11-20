import { useEffect, useState } from "react";
import { sendToBackground } from "../lib/messaging";
import { getSettings, saveSettings } from "../lib/storage";
import { DEFAULT_SETTINGS, type Settings } from "../lib/types";
import { getProvider, listAvailableProviders } from "../providers";

function providerKeyHint(provider: Settings["provider"]): string {
  switch (provider) {
    case "anthropic":
      return "Get a key at console.anthropic.com → API Keys.";
    case "openai":
      return "Get a key at platform.openai.com → API keys.";
    case "google":
      return "Get a key at aistudio.google.com → Get API key.";
    case "openrouter":
      return "Get a key at openrouter.ai → Keys. Model field accepts any slug from openrouter.ai/models.";
    case "abacus":
      return "Get a key from the RouteLLM API page in your Abacus AI / ChatLLM account.";
    default:
      return "";
  }
}

export default function Options() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [clearStatus, setClearStatus] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  async function update(patch: Partial<Settings>) {
    const next = await saveSettings(patch);
    setSettings(next);
    setSavedAt(Date.now());
  }

  async function handleClearHistory() {
    await sendToBackground({ kind: "CLEAR_HISTORY" });
    setClearStatus("Local task history cleared.");
  }

  const providers = listAvailableProviders();

  return (
    <div className="options">
      <h1>AI Browser Assistant — Settings</h1>

      <section>
        <h2>AI provider (BYOK)</h2>
        <p className="help">
          Your API key is stored only in this browser's local extension storage. It is never sent anywhere except
          directly to the provider you choose below, and is never synced to Chrome sync or any server of ours.
        </p>
        <label>
          Provider
          <select
            value={settings.provider}
            onChange={(e) => {
              const id = e.target.value as Settings["provider"];
              update({ provider: id, model: getProvider(id).defaultModel });
            }}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Model
          <input value={settings.model} onChange={(e) => update({ model: e.target.value })} />
        </label>
        <p className="help">{providerKeyHint(settings.provider)}</p>
        <label>
          API key
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="Paste your API key"
            autoComplete="off"
          />
        </label>
      </section>

      <section>
        <h2>Confirmation policy (FR-010)</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.confirmBeforeAnyAction}
            onChange={(e) => update({ confirmBeforeAnyAction: e.target.checked })}
          />
          Require confirmation before every action, not just sensitive ones
        </label>
        <p className="help">
          Sending messages, submitting forms, purchases, deletions and publishing always require confirmation
          regardless of this setting.
        </p>
      </section>

      <section>
        <h2>Task history &amp; Google Sheets</h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.historyEnabled}
            onChange={(e) => update({ historyEnabled: e.target.checked })}
          />
          Keep task history (summaries only — never full page content)
        </label>
        <label>
          Google Sheet ID
          <input
            value={settings.sheetId}
            onChange={(e) => update({ sheetId: e.target.value })}
            placeholder="the long ID from your spreadsheet's URL"
          />
        </label>
        <p className="help">
          Create a blank Google Sheet, copy the ID from its URL (between <code>/d/</code> and <code>/edit</code>), and
          paste it above. The extension creates "Tasks" and "Files" tabs in it automatically.
        </p>
      </section>

      <section>
        <h2>Google Drive (screenshots &amp; files)</h2>
        <label className="checkbox-row">
          <input type="checkbox" checked={settings.driveEnabled} onChange={(e) => update({ driveEnabled: e.target.checked })} />
          Enable saving screenshots/files to Drive
        </label>
        <label>
          Drive folder ID (optional)
          <input
            value={settings.driveFolderId}
            onChange={(e) => update({ driveFolderId: e.target.value })}
            placeholder="leave blank to save to My Drive root"
          />
        </label>
      </section>

      <section>
        <h2>Storage controls</h2>
        <button onClick={handleClearHistory}>Clear local task history</button>
        {clearStatus && <p className="help">{clearStatus}</p>}
      </section>

      {savedAt && <p className="saved-indicator">Saved.</p>}
    </div>
  );
}
