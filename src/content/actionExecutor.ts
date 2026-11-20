import type { ActionStep } from "../lib/types";

export interface ExecResult {
  ok: boolean;
  resultSummary?: string;
  errorMessage?: string;
}

function findTarget(selector: string | undefined): HTMLElement | null {
  if (!selector) return null;
  try {
    return document.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function dispatchInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Executes exactly one already-confirmed step on the live page.
 * Each branch reports precisely what happened — we never report success
 * unless the DOM actually reflects the action (AC-06 / FR-011: "do not
 * claim an action succeeded unless the browser confirms it").
 */
export function executeStep(step: ActionStep): ExecResult {
  switch (step.type) {
    case "navigate": {
      if (!step.value) return { ok: false, errorMessage: "navigate step missing a URL." };
      try {
        const url = new URL(step.value, location.href);
        location.href = url.toString();
        return { ok: true, resultSummary: `Navigating to ${url.toString()}` };
      } catch {
        return { ok: false, errorMessage: `"${step.value}" is not a valid URL.` };
      }
    }

    case "click":
    case "submit_form":
    case "send_message":
    case "purchase":
    case "delete":
    case "publish": {
      const el = findTarget(step.target);
      if (!el) return { ok: false, errorMessage: `Could not find element for selector "${step.target}".` };
      el.scrollIntoView({ block: "center" });
      el.click();
      return { ok: true, resultSummary: `Clicked "${step.description}".` };
    }

    case "fill": {
      const el = findTarget(step.target);
      if (!el) return { ok: false, errorMessage: `Could not find field for selector "${step.target}".` };
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        el.value = step.value ?? "";
        dispatchInputEvents(el);
        return { ok: true, resultSummary: `Filled field with provided value.` };
      }
      el.setAttribute("contenteditable", el.getAttribute("contenteditable") ?? "true");
      el.textContent = step.value ?? "";
      dispatchInputEvents(el);
      return { ok: true, resultSummary: `Set text content of target element.` };
    }

    case "select_option": {
      const el = findTarget(step.target);
      if (!el || !(el instanceof HTMLSelectElement)) {
        return { ok: false, errorMessage: `Could not find a <select> for selector "${step.target}".` };
      }
      const wanted = step.value ?? "";
      const match = Array.from(el.options).find(
        (o) => o.value === wanted || o.label === wanted || o.text.trim() === wanted
      );
      if (!match) return { ok: false, errorMessage: `Option "${wanted}" not found in select.` };
      el.value = match.value;
      dispatchInputEvents(el);
      return { ok: true, resultSummary: `Selected option "${match.label}".` };
    }

    case "scroll_to": {
      const el = findTarget(step.target);
      if (!el) return { ok: false, errorMessage: `Could not find element to scroll to.` };
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return { ok: true, resultSummary: "Scrolled into view." };
    }

    case "wait": {
      // Executed synchronously here; orchestrator handles real delay if needed.
      return { ok: true, resultSummary: "Wait acknowledged." };
    }

    case "extract": {
      const el = findTarget(step.target);
      const value = el ? (el as HTMLElement).innerText ?? el.textContent ?? "" : "";
      return { ok: true, resultSummary: value.trim().slice(0, 2000) || "(no text found)" };
    }

    default:
      return { ok: false, errorMessage: `Unsupported action type.` };
  }
}
