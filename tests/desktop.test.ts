import { describe, expect, it, vi } from "vitest";
import { isEditableTarget, shortcutAction } from "@/lib/shortcuts";
import { copyText } from "@/lib/copy";
import { initialSelection, neighbourhood, stepSelection, toggleSelection } from "@/lib/selection";
import { en } from "@/i18n/en";
import { getDict } from "@/i18n";

const idle = { running: false };
const busy = { running: true };
const outside = { editable: false, isCheckInput: false };
const inInput = { editable: true, isCheckInput: true };
const otherField = { editable: true, isCheckInput: false };

describe("keyboard shortcuts", () => {
  it("'/' focuses the input only when not typing in a field", () => {
    expect(shortcutAction({ key: "/" }, outside, idle)).toBe("focus");
    expect(shortcutAction({ key: "/" }, inInput, idle)).toBeNull(); // typing '/' into the address (URLs!) is untouched
    expect(shortcutAction({ key: "/" }, otherField, idle)).toBeNull();
    expect(shortcutAction({ key: "/", ctrlKey: true }, outside, idle)).toBeNull();
    expect(shortcutAction({ key: "/", metaKey: true }, outside, idle)).toBeNull();
  });
  it("Enter submits only from the check input, not with Shift / IME / modifiers / while running", () => {
    expect(shortcutAction({ key: "Enter" }, inInput, idle)).toBe("submit");
    expect(shortcutAction({ key: "Enter", shiftKey: true }, inInput, idle)).toBeNull();
    expect(shortcutAction({ key: "Enter", isComposing: true }, inInput, idle)).toBeNull();
    expect(shortcutAction({ key: "Enter", ctrlKey: true }, inInput, idle)).toBeNull();
    expect(shortcutAction({ key: "Enter", repeat: true }, inInput, idle)).toBeNull();
    expect(shortcutAction({ key: "Enter" }, inInput, busy)).toBeNull();
    expect(shortcutAction({ key: "Enter" }, otherField, idle)).toBeNull();
    expect(shortcutAction({ key: "Enter" }, outside, idle)).toBeNull();
  });
  it("Esc cancels only a running check", () => {
    expect(shortcutAction({ key: "Escape" }, outside, busy)).toBe("cancel");
    expect(shortcutAction({ key: "Escape" }, outside, idle)).toBeNull();
    expect(shortcutAction({ key: "Escape", altKey: true }, outside, busy)).toBeNull();
  });
  it("ordinary letters are never hijacked", () => {
    for (const key of ["a", "k", "?", " ", "Tab"]) {
      expect(shortcutAction({ key }, outside, idle)).toBeNull();
      expect(shortcutAction({ key }, inInput, idle)).toBeNull();
    }
  });
  it("detects editable targets", () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "INPUT", type: "text" } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: "INPUT", type: "checkbox" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
});

describe("copy address", () => {
  const ADDR = "0x0000000000000000000000000000000000000037";
  it("uses the async clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const legacyCopy = vi.fn();
    expect(await copyText(ADDR, { clipboard: { writeText }, legacyCopy })).toBe(true);
    expect(writeText).toHaveBeenCalledWith(ADDR);
    expect(legacyCopy).not.toHaveBeenCalled();
  });
  it("falls back to the legacy path when the clipboard rejects or is missing", async () => {
    const legacyCopy = vi.fn().mockReturnValue(true);
    expect(await copyText(ADDR, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, legacyCopy })).toBe(true);
    expect(await copyText(ADDR, { clipboard: null, legacyCopy })).toBe(true);
    expect(legacyCopy).toHaveBeenCalledTimes(2);
  });
  it("reports failure instead of a fake 'copied'", async () => {
    expect(await copyText(ADDR, { clipboard: null })).toBe(false);
    expect(await copyText(ADDR, { clipboard: null, legacyCopy: () => { throw new Error("x"); } })).toBe(false);
    expect(await copyText("", { clipboard: { writeText: vi.fn() } })).toBe(false);
  });
});

describe("cluster node selection", () => {
  const edges = [{ source: "a", target: "b" }, { source: "b", target: "c" }, { source: "d", target: "e" }];
  it("toggles", () => {
    expect(toggleSelection(null, "a")).toBe("a");
    expect(toggleSelection("a", "b")).toBe("b");
    expect(toggleSelection("b", "b")).toBeNull();
  });
  it("neighbourhood = node + direct links", () => {
    expect([...neighbourhood("b", edges)].sort()).toEqual(["a", "b", "c"]);
    expect([...neighbourhood("a", edges)].sort()).toEqual(["a", "b"]);
    expect(neighbourhood(null, edges).size).toBe(0);
  });
  it("arrow-key stepping wraps", () => {
    const ids = ["a", "b", "c"];
    expect(stepSelection(ids, null, 1)).toBe("a");
    expect(stepSelection(ids, null, -1)).toBe("c");
    expect(stepSelection(ids, "c", 1)).toBe("a");
    expect(stepSelection(ids, "a", -1)).toBe("c");
    expect(stepSelection([], "a", 1)).toBeNull();
  });
  it("starts on the mother wallet, else the target", () => {
    expect(initialSelection([{ id: "t", isMother: false, isTarget: true }, { id: "m", isMother: true, isTarget: false }])).toBe("m");
    expect(initialSelection([{ id: "x", isMother: false, isTarget: false }, { id: "t", isMother: false, isTarget: true }])).toBe("t");
    expect(initialSelection([])).toBeNull();
  });
});

describe("desktop i18n strings", () => {
  it("are in the EN dict, merged into RU, and never say SAFE", () => {
    expect(en.ui.copied).toBeTruthy();
    expect(getDict("ru").ui.shortcutsTitle).toBe("Горячие клавиши"); // RU is fully translated now
    expect(JSON.stringify(en.ui)).not.toMatch(/\bSAFE\b/i);
  });
});
