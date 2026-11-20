import type { PageContext } from "../lib/types";

const MAX_TEXT_CHARS = 12000;
const MAX_ELEMENTS = 150;

/** Rough accessible-text extraction: skips hidden nodes, script/style, and collapses whitespace. */
function extractVisibleText(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
      const style = window.getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden") return NodeFilter.FILTER_REJECT;
      if (!node.textContent || !node.textContent.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const parts: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    parts.push(node.textContent!.trim());
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function describeElement(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim().slice(0, 120);
  const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
  if (text.trim()) return text.trim().slice(0, 120);
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) return placeholder.trim().slice(0, 120);
  const title = el.getAttribute("title");
  if (title) return title.trim().slice(0, 120);
  const name = el.getAttribute("name");
  if (name) return name.trim().slice(0, 120);
  return "(unlabeled)";
}

function roleOf(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "select") return "select";
  if (tag === "textarea") return "textbox";
  if (tag === "input") {
    const type = (el as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button") return "button";
    return "textbox";
  }
  return tag;
}

/** Assigns a stable-ish data attribute so the background/model can target the exact element later. */
let selectorCounter = 0;
function ensureSelector(el: Element): string {
  const existingId = el.getAttribute("id");
  if (existingId) return `#${CSS.escape(existingId)}`;
  const dataAttr = el.getAttribute("data-ai-assistant-id");
  if (dataAttr) return `[data-ai-assistant-id="${dataAttr}"]`;
  const id = `aia-${selectorCounter++}`;
  el.setAttribute("data-ai-assistant-id", id);
  return `[data-ai-assistant-id="${id}"]`;
}

export function readPageContext(): PageContext {
  const fullText = extractVisibleText(document.body);
  const truncated = fullText.length > MAX_TEXT_CHARS;
  const text = truncated ? fullText.slice(0, MAX_TEXT_CHARS) : fullText;

  const selection = window.getSelection()?.toString().trim() || null;

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [role=button], [role=link], [onclick]"
    )
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const interactiveElements = candidates.slice(0, MAX_ELEMENTS).map((el) => ({
    selector: ensureSelector(el),
    role: roleOf(el),
    label: describeElement(el),
  }));

  return {
    url: location.href,
    title: document.title,
    text,
    selection: selection || null,
    interactiveElements,
    truncated,
  };
}
