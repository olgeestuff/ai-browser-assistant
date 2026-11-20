import { useEffect, useRef, useState } from "react";
import type { BackgroundToUiMessage } from "../lib/messaging";
import { sendToBackground } from "../lib/messaging";
import type { TaskRecord } from "../lib/types";
import PlanPreview from "./PlanPreview";

export default function App() {
  const [instruction, setInstruction] = useState("");
  const [useSelectionOnly, setUseSelectionOnly] = useState(false);
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenshotStatus, setScreenshotStatus] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sendToBackground<TaskRecord | null>({ kind: "GET_ACTIVE_TASK" }).then((t) => t && setTask(t));

    const listener = (message: BackgroundToUiMessage) => {
      if (message.kind === "TASK_UPDATED" || message.kind === "PLAN_READY") {
        setTask(message.task);
        if (message.task.status !== "planning") setBusy(false);
      } else if (message.kind === "ERROR") {
        setError(message.message);
        setBusy(false);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || busy) return;
    setBusy(true);
    setError(null);
    const text = instruction.trim();
    setInstruction("");
    await sendToBackground({ kind: "RUN_INSTRUCTION", instruction: text, useSelectionOnly });
  }

  async function handleStop() {
    if (!task) return;
    await sendToBackground({ kind: "STOP_TASK", taskId: task.taskId });
  }

  async function handleScreenshot() {
    setScreenshotStatus("Capturing…");
    const result = await sendToBackground<{ driveUrl?: string; error?: string }>({ kind: "CAPTURE_SCREENSHOT" });
    if (result.error) setScreenshotStatus(`Failed: ${result.error}`);
    else setScreenshotStatus(`Saved to Drive: ${result.driveUrl}`);
  }

  const isActive = task && !["completed", "failed", "stopped"].includes(task.status);

  return (
    <div className="app">
      <header className="app-header">
        <h1>AI Browser Assistant</h1>
        <button className="icon-btn" title="Settings" onClick={() => chrome.runtime.openOptionsPage()}>
          ⚙
        </button>
      </header>

      <div className="log">
        {!task && <p className="hint">Ask a question about this page, or tell me what to do on it.</p>}

        {task && (
          <div className="task-card">
            <p className="instruction">
              <strong>You:</strong> {task.instruction}
            </p>

            {task.status === "planning" && <p className="status">Reading the page and planning…</p>}

            {task.plan && <PlanPreview task={task} />}

            {task.resultSummary && (task.status === "completed" || task.status === "failed" || task.status === "stopped") && (
              <p className={`status ${task.status}`}>
                <strong>
                  {task.status === "completed" ? "Done:" : task.status === "failed" ? "Error:" : "Stopped:"}
                </strong>{" "}
                {task.resultSummary}
              </p>
            )}
          </div>
        )}

        {error && <p className="status failed">{error}</p>}
        <div ref={logEndRef} />
      </div>

      <div className="toolbar">
        <label className="checkbox">
          <input type="checkbox" checked={useSelectionOnly} onChange={(e) => setUseSelectionOnly(e.target.checked)} />
          Use selected text only
        </label>
        <button className="link-btn" onClick={handleScreenshot}>
          📷 Save screenshot
        </button>
        {isActive && (
          <button className="stop-btn" onClick={handleStop}>
            ⏹ Stop
          </button>
        )}
      </div>
      {screenshotStatus && <p className="hint small">{screenshotStatus}</p>}

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="e.g. summarize this page, or extract the contact email"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button type="submit" disabled={busy || !instruction.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
