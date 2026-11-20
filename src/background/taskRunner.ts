import { broadcastToUi, sendToTab, type ContentExecuteStepResponse, type ContentReadPageResponse } from "../lib/messaging";
import { getProvider } from "../providers";
import { ProviderError } from "../providers/types";
import {
  appendFileRow,
  appendTaskRow,
  ensureFilesSheet,
  ensureTasksSheet,
  getAuthToken,
  uploadFileToDrive,
} from "../lib/google";
import { appendLocalTask, getSettings, updateLocalTask } from "../lib/storage";
import type { ActionPlan, StepResult, TaskRecord } from "../lib/types";

/**
 * Single active task at a time, by design — a personal assistant acting on
 * "the page currently open" (per the requirements doc's project goal) is a
 * one-conversation-at-a-time tool, which also keeps the confirmation/stop
 * model simple and unambiguous (FR-012).
 */
class TaskRunner {
  private current: TaskRecord | null = null;
  private stopRequested = false;
  private tabId: number | null = null;

  getCurrent(): TaskRecord | null {
    return this.current;
  }

  private setCurrent(patch: Partial<TaskRecord>) {
    if (!this.current) return;
    this.current = { ...this.current, ...patch };
    broadcastToUi({ kind: "TASK_UPDATED", task: this.current });
    updateLocalTask(this.current.taskId, this.current).catch(() => void 0);
  }

  private setStep(sequence: number, patch: Partial<StepResult>) {
    if (!this.current) return;
    const steps = this.current.steps.map((s) => (s.sequence === sequence ? { ...s, ...patch } : s));
    this.setCurrent({ steps });
  }

  async runInstruction(instruction: string, useSelectionOnly: boolean): Promise<TaskRecord> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) {
      throw new Error("No active tab found. Open a tab and try again.");
    }
    this.tabId = tab.id;
    this.stopRequested = false;

    const taskId = crypto.randomUUID();
    this.current = {
      taskId,
      createdAt: new Date().toISOString(),
      instruction,
      tabUrl: tab.url,
      status: "planning",
      steps: [],
    };
    broadcastToUi({ kind: "TASK_UPDATED", task: this.current });
    await appendLocalTask(this.current);

    try {
      const pageResp = (await sendToTab(tab.id, { kind: "READ_PAGE" })) as ContentReadPageResponse;
      let context = pageResp.context;
      if (useSelectionOnly && context.selection) {
        context = { ...context, text: context.selection };
      }

      const settings = await getSettings();
      const provider = getProvider(settings.provider);
      const plan: ActionPlan = await provider.generatePlan({
        instruction,
        page: context,
        apiKey: settings.apiKey,
        model: settings.model,
      });

      const steps: StepResult[] = plan.steps.map((s) => ({ sequence: s.sequence, status: "pending" }));

      if (plan.isReadOnly) {
        this.setCurrent({
          status: "completed",
          plan,
          steps,
          resultSummary: plan.answer ?? plan.summary,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        await this.logToSheetsIfEnabled();
        return this.current!;
      }

      // Always show the plan for preview before anything runs (FR-009 / AC-05).
      this.setCurrent({ status: "awaiting_confirmation", plan, steps });
      broadcastToUi({ kind: "PLAN_READY", task: this.current! });
      return this.current!;
    } catch (e) {
      const message = e instanceof ProviderError ? e.message : (e as Error).message;
      const code = e instanceof ProviderError ? e.code : "UNKNOWN_ERROR";
      this.setCurrent({ status: "failed", errorCode: code, resultSummary: message, completedAt: new Date().toISOString() });
      await this.logToSheetsIfEnabled();
      broadcastToUi({ kind: "ERROR", message, code });
      return this.current!;
    }
  }

  /** User approved (or rejected) the whole plan from the preview screen. */
  async confirmAll(taskId: string, approved: boolean): Promise<void> {
    if (!this.current || this.current.taskId !== taskId) return;
    if (!approved) {
      this.setCurrent({ status: "stopped", completedAt: new Date().toISOString(), resultSummary: "Plan rejected by user." });
      await this.logToSheetsIfEnabled();
      return;
    }
    this.setCurrent({ status: "running", startedAt: new Date().toISOString() });
    await this.runFrom(1);
  }

  /** User approved/rejected one individual sensitive step (FR-010 / AC-07), then execution resumes from there. */
  async confirmStep(taskId: string, sequence: number, approved: boolean): Promise<void> {
    if (!this.current || this.current.taskId !== taskId) return;
    if (!approved) {
      this.setStep(sequence, { status: "skipped_stopped" });
      this.markRemainingStopped();
      await this.logToSheetsIfEnabled();
      return;
    }
    this.setCurrent({ status: "running" });
    await this.runFrom(sequence);
  }

  requestStop(taskId: string): void {
    if (!this.current || this.current.taskId !== taskId) return;
    this.stopRequested = true;
  }

  /**
   * Single sequential loop that executes steps starting at `fromSequence`.
   * Stops (returns, leaving status for the UI to act on) as soon as it hits
   * a step needing confirmation, a stop request, or a failure — never guesses
   * past any of those (FR-012 / AC-08).
   */
  private async runFrom(fromSequence: number): Promise<void> {
    if (!this.current?.plan || !this.tabId) return;
    const steps = this.current.plan.steps.filter((s) => s.sequence >= fromSequence);

    for (const step of steps) {
      if (this.stopRequested) {
        this.markRemainingStopped();
        return;
      }

      const alreadyHandled = this.current.steps.find((s) => s.sequence === step.sequence)?.status;
      if (step.requiresConfirmation && alreadyHandled !== "running") {
        this.setStep(step.sequence, { status: "awaiting_confirmation" });
        this.setCurrent({ status: "awaiting_confirmation" });
        return; // wait for confirmStep()
      }

      this.setStep(step.sequence, { status: "running" });
      let result: ContentExecuteStepResponse;
      try {
        result = (await sendToTab(this.tabId, { kind: "EXECUTE_STEP", step })) as ContentExecuteStepResponse;
      } catch (e) {
        this.failTask(step.sequence, "TAB_COMMUNICATION_ERROR", (e as Error).message);
        await this.logToSheetsIfEnabled();
        return;
      }

      if (!result.ok) {
        this.failTask(step.sequence, "STEP_EXECUTION_FAILED", result.errorMessage ?? "Step failed.");
        await this.logToSheetsIfEnabled();
        return;
      }
      this.setStep(step.sequence, { status: "done", resultSummary: result.resultSummary });
    }

    this.finish();
  }

  private failTask(sequence: number, errorCode: string, message: string) {
    this.setStep(sequence, { status: "failed", errorMessage: message });
    this.setCurrent({ status: "failed", errorCode, resultSummary: message, completedAt: new Date().toISOString() });
  }

  private markRemainingStopped() {
    if (!this.current) return;
    const steps = this.current.steps.map((s) =>
      s.status === "pending" || s.status === "awaiting_confirmation" ? { ...s, status: "skipped_stopped" as const } : s
    );
    this.setCurrent({ status: "stopped", steps, completedAt: new Date().toISOString(), resultSummary: "Stopped by user." });
    this.logToSheetsIfEnabled().catch(() => void 0);
  }

  private finish() {
    if (!this.current) return;
    this.setCurrent({
      status: "completed",
      completedAt: new Date().toISOString(),
      resultSummary: this.current.plan?.summary,
    });
    this.logToSheetsIfEnabled().catch(() => void 0);
  }

  private async logToSheetsIfEnabled(): Promise<void> {
    if (!this.current) return;
    const settings = await getSettings();
    if (!settings.historyEnabled || !settings.sheetId) return;
    try {
      const token = await getAuthToken(false);
      await ensureTasksSheet(settings.sheetId, token);
      await appendTaskRow(settings.sheetId, token, this.current);
    } catch {
      // Logging failures must never break the task itself — the user still
      // sees the result in the side panel and local history either way.
    }
  }

  /** FR-017/FR-018: capture + save a screenshot of the current tab to Drive, recording metadata in Sheets. */
  async captureAndSaveScreenshot(): Promise<{ driveUrl: string } | { error: string }> {
    try {
      const settings = await getSettings();
      if (!settings.driveEnabled) return { error: "Drive saving is turned off in Settings." };
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.windowId) return { error: "No active tab/window to capture." };

      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `screenshot-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;

      const token = await getAuthToken(true);
      const uploaded = await uploadFileToDrive(token, settings.driveFolderId, fileName, "image/png", blob);

      if (settings.sheetId) {
        await ensureFilesSheet(settings.sheetId, token);
        await appendFileRow(settings.sheetId, token, {
          fileId: crypto.randomUUID(),
          taskId: this.current?.taskId ?? "",
          driveFileId: uploaded.fileId,
          fileName: uploaded.name,
          mimeType: uploaded.mimeType,
          driveUrl: uploaded.webViewLink,
        });
      }
      return { driveUrl: uploaded.webViewLink };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }
}

export const taskRunner = new TaskRunner();
