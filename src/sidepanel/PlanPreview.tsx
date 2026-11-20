import { sendToBackground } from "../lib/messaging";
import type { TaskRecord } from "../lib/types";

const STEP_ICON: Record<string, string> = {
  pending: "○",
  awaiting_confirmation: "⚠",
  running: "◐",
  done: "✓",
  failed: "✗",
  skipped_stopped: "⊘",
};

/**
 * Shows the planned actions in plain language before anything runs (FR-009),
 * and gates sensitive steps behind an explicit per-step confirm (FR-010).
 */
export default function PlanPreview({ task }: { task: TaskRecord }) {
  if (!task.plan) return null;
  const { plan, steps } = task;

  async function confirmAll(approved: boolean) {
    await sendToBackground({ kind: "CONFIRM_ALL", taskId: task.taskId, approved });
  }

  async function confirmStep(sequence: number, approved: boolean) {
    await sendToBackground({ kind: "CONFIRM_STEP", taskId: task.taskId, sequence, approved });
  }

  const pendingSensitiveStep = plan.steps.find(
    (s) => s.requiresConfirmation && steps.find((r) => r.sequence === s.sequence)?.status === "awaiting_confirmation"
  );

  return (
    <div className="plan-preview">
      <p className="plan-summary">{plan.summary}</p>
      <ol className="plan-steps">
        {plan.steps.map((step) => {
          const result = steps.find((s) => s.sequence === step.sequence);
          return (
            <li key={step.sequence} className={`plan-step ${result?.status ?? "pending"}`}>
              <span className="step-icon">{STEP_ICON[result?.status ?? "pending"]}</span>
              <span className="step-desc">
                {step.description}
                {step.requiresConfirmation && <span className="sensitive-badge"> (needs confirmation)</span>}
              </span>
              {result?.errorMessage && <span className="step-error"> — {result.errorMessage}</span>}
              {result?.resultSummary && result.status === "done" && (
                <span className="step-result"> — {result.resultSummary}</span>
              )}
            </li>
          );
        })}
      </ol>

      {task.status === "awaiting_confirmation" && !pendingSensitiveStep && (
        <div className="plan-actions">
          <button className="confirm-btn" onClick={() => confirmAll(true)}>
            ✓ Run this plan
          </button>
          <button className="reject-btn" onClick={() => confirmAll(false)}>
            ✗ Don't run
          </button>
        </div>
      )}

      {pendingSensitiveStep && (
        <div className="plan-actions sensitive">
          <p className="sensitive-prompt">
            This step is consequential — confirm before it runs: <strong>{pendingSensitiveStep.description}</strong>
          </p>
          <button className="confirm-btn" onClick={() => confirmStep(pendingSensitiveStep.sequence, true)}>
            ✓ Confirm & run this step
          </button>
          <button className="reject-btn" onClick={() => confirmStep(pendingSensitiveStep.sequence, false)}>
            ✗ Skip & stop
          </button>
        </div>
      )}
    </div>
  );
}
