import type { BackgroundToContentMessage, ContentExecuteStepResponse, ContentReadPageResponse } from "../lib/messaging";
import { executeStep } from "./actionExecutor";
import { readPageContext } from "./extractor";

// Passive by design (Security & Privacy: "User invocation" requirement) —
// this script only reads/acts when explicitly messaged by the background
// orchestrator in response to a user action. It never runs a timer, never
// observes the page continuously, and never sends anything anywhere on its own.
chrome.runtime.onMessage.addListener(
  (message: BackgroundToContentMessage, _sender, sendResponse) => {
    if (message.kind === "READ_PAGE") {
      const context = readPageContext();
      const response: ContentReadPageResponse = { kind: "PAGE_CONTEXT", context };
      sendResponse(response);
      return true;
    }

    if (message.kind === "EXECUTE_STEP") {
      const result = executeStep(message.step);
      const response: ContentExecuteStepResponse = {
        kind: "STEP_RESULT",
        sequence: message.step.sequence,
        ok: result.ok,
        resultSummary: result.resultSummary,
        errorMessage: result.errorMessage,
      };
      sendResponse(response);
      return true;
    }

    return false;
  }
);
