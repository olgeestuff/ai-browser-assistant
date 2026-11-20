import type { UiToBackgroundMessage } from "../lib/messaging";
import { clearLocalTaskHistory, getLocalTaskHistory } from "../lib/storage";
import { taskRunner } from "./taskRunner";

// Open the side panel when the user clicks the toolbar icon.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => void 0);
});

chrome.runtime.onMessage.addListener((message: UiToBackgroundMessage, _sender, sendResponse) => {
  (async () => {
    switch (message.kind) {
      case "RUN_INSTRUCTION": {
        const task = await taskRunner.runInstruction(message.instruction, message.useSelectionOnly);
        sendResponse(task);
        return;
      }
      case "CONFIRM_STEP": {
        await taskRunner.confirmStep(message.taskId, message.sequence, message.approved);
        sendResponse(taskRunner.getCurrent());
        return;
      }
      case "CONFIRM_ALL": {
        await taskRunner.confirmAll(message.taskId, message.approved);
        sendResponse(taskRunner.getCurrent());
        return;
      }
      case "STOP_TASK": {
        taskRunner.requestStop(message.taskId);
        sendResponse({ ok: true });
        return;
      }
      case "GET_ACTIVE_TASK": {
        sendResponse(taskRunner.getCurrent());
        return;
      }
      case "GET_HISTORY": {
        sendResponse(await getLocalTaskHistory());
        return;
      }
      case "CLEAR_HISTORY": {
        await clearLocalTaskHistory();
        sendResponse({ ok: true });
        return;
      }
      case "CAPTURE_SCREENSHOT": {
        sendResponse(await taskRunner.captureAndSaveScreenshot());
        return;
      }
    }
  })();
  return true; // keep the message channel open for the async response above
});
