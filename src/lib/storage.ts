import { DEFAULT_SETTINGS, type Settings, type TaskRecord } from "./types";

// chrome.storage.local (never .sync) — keeps the API key and any task history
// on this one device only (OD-03 default) and out of Google's sync channel.
const SETTINGS_KEY = "settings";
const TASKS_KEY = "tasks"; // small in-memory-ish cache mirrored to Sheets when historyEnabled

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getLocalTaskHistory(): Promise<TaskRecord[]> {
  const stored = await chrome.storage.local.get(TASKS_KEY);
  return (stored[TASKS_KEY] as TaskRecord[] | undefined) ?? [];
}

export async function appendLocalTask(task: TaskRecord): Promise<void> {
  const tasks = await getLocalTaskHistory();
  tasks.unshift(task);
  // Keep only the most recent 200 locally; Sheets is the durable store when enabled.
  await chrome.storage.local.set({ [TASKS_KEY]: tasks.slice(0, 200) });
}

export async function updateLocalTask(taskId: string, patch: Partial<TaskRecord>): Promise<void> {
  const tasks = await getLocalTaskHistory();
  const idx = tasks.findIndex((t) => t.taskId === taskId);
  if (idx !== -1) {
    tasks[idx] = { ...tasks[idx], ...patch };
    await chrome.storage.local.set({ [TASKS_KEY]: tasks });
  }
}

/** OD-04 default: clear stored task/conversation data on request (storage controls). */
export async function clearLocalTaskHistory(): Promise<void> {
  await chrome.storage.local.remove(TASKS_KEY);
}
