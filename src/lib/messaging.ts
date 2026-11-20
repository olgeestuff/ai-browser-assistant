import type { ActionStep, ImageAttachment, PageContext, TaskRecord } from "./types";

// ---- Side panel -> background ----
export type UiToBackgroundMessage =
  | { kind: "RUN_INSTRUCTION"; instruction: string; useSelectionOnly: boolean; image?: ImageAttachment }
  | { kind: "CONFIRM_STEP"; taskId: string; sequence: number; approved: boolean }
  | { kind: "CONFIRM_ALL"; taskId: string; approved: boolean }
  | { kind: "STOP_TASK"; taskId: string }
  | { kind: "GET_ACTIVE_TASK" }
  | { kind: "GET_HISTORY" }
  | { kind: "CLEAR_HISTORY" }
  | { kind: "CAPTURE_SCREENSHOT" };

// ---- Background -> side panel (broadcast) ----
export type BackgroundToUiMessage =
  | { kind: "TASK_UPDATED"; task: TaskRecord }
  | { kind: "PLAN_READY"; task: TaskRecord }
  | { kind: "ERROR"; message: string; code?: string };

// ---- Background -> content script ----
export type BackgroundToContentMessage =
  | { kind: "READ_PAGE" }
  | { kind: "EXECUTE_STEP"; step: ActionStep };

// ---- Content script -> background (response payloads) ----
export type ContentReadPageResponse = { kind: "PAGE_CONTEXT"; context: PageContext };
export type ContentExecuteStepResponse = {
  kind: "STEP_RESULT";
  sequence: number;
  ok: boolean;
  resultSummary?: string;
  errorMessage?: string;
};

export function sendToBackground<T = unknown>(message: UiToBackgroundMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

export function broadcastToUi(message: BackgroundToUiMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // No side panel listening right now — fine, state is still persisted.
  });
}

export function sendToTab<TResp>(
  tabId: number,
  message: BackgroundToContentMessage
): Promise<TResp> {
  return chrome.tabs.sendMessage(tabId, message);
}
