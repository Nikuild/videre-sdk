// Keyboard shortcuts for the check form. Pure decision function (unit-tested); the hook only wires it to keydown.
//   "/"     -> focus the address input (only when the user is NOT typing in an editable field)
//   Enter   -> run the check (only inside the address input; Shift+Enter / IME composition are left alone)
//   Escape  -> cancel a running check (no-op when nothing is running, so it never steals Esc from anything else)
export type ShortcutAction = "focus" | "submit" | "cancel" | null;

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  repeat?: boolean;
}

export interface TargetInfo {
  /** focus is inside an input / textarea / select / contenteditable */
  editable: boolean;
  /** focus is the check-form address input itself */
  isCheckInput: boolean;
}

export interface FormState {
  running: boolean;
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || typeof (el as Element).tagName !== "string") return false;
  const e = el as HTMLElement;
  const tag = e.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = ((e as HTMLInputElement).type || "text").toLowerCase();
    return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type);
  }
  return !!e.isContentEditable;
}

export function shortcutAction(e: KeyLike, target: TargetInfo, state: FormState): ShortcutAction {
  if (e.isComposing) return null;
  const mod = !!(e.ctrlKey || e.metaKey || e.altKey);
  if (e.key === "Escape") return state.running && !mod ? "cancel" : null;
  if (e.key === "Enter") return target.isCheckInput && !mod && !e.shiftKey && !state.running && !e.repeat ? "submit" : null;
  if (e.key === "/") return !mod && !target.editable && !state.running ? "focus" : null;
  return null;
}
