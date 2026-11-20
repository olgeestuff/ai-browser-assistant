// Shared types used across background, content script, side panel and providers.

export type ActionType =
  | "navigate"
  | "click"
  | "fill"
  | "select_option"
  | "scroll_to"
  | "wait"
  | "extract"
  // Sensitive / irreversible — always require confirmation (FR-010)
  | "submit_form"
  | "send_message"
  | "purchase"
  | "delete"
  | "publish";

export const SENSITIVE_ACTION_TYPES: ReadonlySet<ActionType> = new Set([
  "submit_form",
  "send_message",
  "purchase",
  "delete",
  "publish",
]);

export interface ActionStep {
  /** 1-based order of execution */
  sequence: number;
  type: ActionType;
  /** Plain-language description shown to the user before execution (FR-009) */
  description: string;
  /** CSS selector or best-effort locator for the target element, if any */
  target?: string;
  /** Value to type / option to select / url to navigate to, if any */
  value?: string;
  /** Explicit flag the model must set for anything consequential; validated against SENSITIVE_ACTION_TYPES too */
  requiresConfirmation: boolean;
}

export interface ActionPlan {
  /** Short plain-language summary of what the whole plan will do */
  summary: string;
  steps: ActionStep[];
  /** If the model determined this is a pure read/answer task with no page actions */
  isReadOnly: boolean;
  /** The model's direct answer/explanation when isReadOnly is true, or null otherwise */
  answer: string | null;
}

export type StepStatus =
  | "pending"
  | "awaiting_confirmation"
  | "running"
  | "done"
  | "failed"
  | "skipped_stopped";

export interface StepResult {
  sequence: number;
  status: StepStatus;
  resultSummary?: string;
  errorCode?: string;
  errorMessage?: string;
  confirmedAt?: string;
}

export type TaskStatus =
  | "planning"
  | "awaiting_confirmation"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export interface TaskRecord {
  taskId: string;
  createdAt: string;
  instruction: string;
  tabUrl: string;
  status: TaskStatus;
  plan?: ActionPlan;
  steps: StepResult[];
  resultSummary?: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PageContext {
  url: string;
  title: string;
  /** Visible, accessible text content (truncated) */
  text: string;
  /** User's current text selection, if any */
  selection: string | null;
  /** Best-effort list of interactive elements the model can target */
  interactiveElements: Array<{
    selector: string;
    role: string; // e.g. "link", "button", "textbox", "select", "checkbox"
    label: string;
  }>;
  truncated: boolean;
}

export type ProviderId = "anthropic" | "openai" | "google";

export interface Settings {
  provider: ProviderId;
  model: string;
  /** BYOK: API key lives only in chrome.storage.local, never synced, never sent to any backend of ours */
  apiKey: string;
  confirmBeforeAnyAction: boolean;
  historyEnabled: boolean;
  driveEnabled: boolean;
  sheetId: string;
  driveFolderId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  apiKey: "",
  confirmBeforeAnyAction: false,
  historyEnabled: true,
  driveEnabled: true,
  sheetId: "",
  driveFolderId: "",
};
