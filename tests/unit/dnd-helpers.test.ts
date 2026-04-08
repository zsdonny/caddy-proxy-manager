import { describe, it, expect } from "vitest";
import {
  enc,
  dec,
  encGap,
  decGap,
  shallowEqual,
  computeProjectedIds,
  type OverInfo,
} from "@/components/folder-organization/dnd-helpers";

// ---------------------------------------------------------------------------
// enc / dec
// ---------------------------------------------------------------------------

describe("enc / dec", () => {
  it("round-trips an item drag id", () => {
    const id: Parameters<typeof enc>[0] = { kind: "item", itemId: "42" };
    const encoded = enc(id);
    const decoded = dec(encoded);
    expect(decoded).toEqual(id);
  });

  it("round-trips a folder drag id", () => {
    const id: Parameters<typeof enc>[0] = { kind: "folder", folderId: "f-1" };
    const encoded = enc(id);
    const decoded = dec(encoded);
    expect(decoded).toEqual(id);
  });

  it("dec returns null for invalid JSON", () => {
    expect(dec("not-json")).toBeNull();
  });

  it("dec handles numeric input (JSON.parse parses numbers)", () => {
    // JSON.parse("123") returns 123, which is not a valid DragId object
    // but dec doesn't validate the shape — it just casts
    expect(dec(123)).toBe(123);
  });
});

// ---------------------------------------------------------------------------
// encGap / decGap
// ---------------------------------------------------------------------------

describe("encGap / decGap", () => {
  it("round-trips gap indices", () => {
    expect(decGap(encGap(0))).toBe(0);
    expect(decGap(encGap(5))).toBe(5);
  });

  it("decGap returns null for non-gap strings", () => {
    expect(decGap("some-other-id")).toBeNull();
    expect(decGap('{"kind":"item"}')).toBeNull();
  });

  it("decGap returns null for NaN suffix", () => {
    expect(decGap("__gap_abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// shallowEqual
// ---------------------------------------------------------------------------

describe("shallowEqual", () => {
  it("returns true for identical arrays", () => {
    const a = ["a", "b", "c"];
    expect(shallowEqual(a, a)).toBe(true);
  });

  it("returns true for same-content arrays", () => {
    expect(shallowEqual(["x", "y"], ["x", "y"])).toBe(true);
  });

  it("returns false for different lengths", () => {
    expect(shallowEqual(["a"], ["a", "b"])).toBe(false);
  });

  it("returns false for different elements", () => {
    expect(shallowEqual(["a", "b"], ["a", "c"])).toBe(false);
  });

  it("returns true for empty arrays", () => {
    expect(shallowEqual([], [])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeProjectedIds — the critical projection logic
// ---------------------------------------------------------------------------

describe("computeProjectedIds", () => {
  const base = ["a", "b", "c", "d"];

  it("returns baseIds unchanged when no active drag", () => {
    const result = computeProjectedIds(base, "folder-1", null, null);
    expect(result).toBe(base); // same reference
  });

  it("returns baseIds unchanged when no overInfo", () => {
    const result = computeProjectedIds(base, "folder-1", "a", null);
    expect(result).toBe(base);
  });

  // ---- Same-container drag (arrayMove) ----

  it("same-container: moves active to over position (forward)", () => {
    const over: OverInfo = { overContainerId: "f1", overItemId: "c" };
    // "a" is dragged over "c" → [b, c, a, d] (arrayMove from 0 to 2)
    const result = computeProjectedIds(base, "f1", "a", over);
    expect(result).toEqual(["b", "c", "a", "d"]);
  });

  it("same-container: moves active to over position (backward)", () => {
    const over: OverInfo = { overContainerId: "f1", overItemId: "a" };
    // "c" is dragged over "a" → [c, a, b, d]
    const result = computeProjectedIds(base, "f1", "c", over);
    expect(result).toEqual(["c", "a", "b", "d"]);
  });

  it("same-container: null overItemId → active goes to end", () => {
    const over: OverInfo = { overContainerId: "f1", overItemId: null };
    const result = computeProjectedIds(base, "f1", "b", over);
    expect(result).toEqual(["a", "c", "d", "b"]);
  });

  it("same-container: unknown overItemId → returns baseIds", () => {
    const over: OverInfo = { overContainerId: "f1", overItemId: "unknown" };
    const result = computeProjectedIds(base, "f1", "a", over);
    expect(result).toBe(base);
  });

  // ---- Cross-container: source side ----

  it("cross-container source: removes active item", () => {
    // "a" is being dragged to "f2" — source container "f1" should remove it
    const over: OverInfo = { overContainerId: "f2", overItemId: "x" };
    const result = computeProjectedIds(base, "f1", "a", over);
    expect(result).toEqual(["b", "c", "d"]);
  });

  // ---- Cross-container: target side ----

  it("cross-container target: inserts active before overItem", () => {
    const targetBase = ["x", "y", "z"];
    const over: OverInfo = { overContainerId: "f2", overItemId: "y" };
    // "a" is dragged into "f2" before "y"
    const result = computeProjectedIds(targetBase, "f2", "a", over);
    expect(result).toEqual(["x", "a", "y", "z"]);
  });

  it("cross-container target: null overItemId → appends at end", () => {
    const targetBase = ["x", "y"];
    const over: OverInfo = { overContainerId: "f2", overItemId: null };
    const result = computeProjectedIds(targetBase, "f2", "a", over);
    expect(result).toEqual(["x", "y", "a"]);
  });

  it("cross-container target: unknown overItemId → appends at end", () => {
    const targetBase = ["x", "y"];
    const over: OverInfo = { overContainerId: "f2", overItemId: "unknown" };
    const result = computeProjectedIds(targetBase, "f2", "a", over);
    expect(result).toEqual(["x", "y", "a"]);
  });

  // ---- Uninvolved container ----

  it("uninvolved container: returns baseIds unchanged", () => {
    const over: OverInfo = { overContainerId: "f2", overItemId: "x" };
    // Container "f3" is neither source nor target
    const result = computeProjectedIds(["p", "q"], "f3", "a", over);
    expect(result).toEqual(["p", "q"]);
  });

  // ---- The oscillation regression scenario ----
  // This is the sequence that caused the infinite loop:
  // drag A from folder-1 to ungrouped, then to folder-2, then back to folder-1
  // Each step must produce consistent projections.

  it("regression: rapid A→B→ungrouped→B→A does not break projections", () => {
    const folderAItems = ["item1", "item2", "item3"];
    const folderBItems = ["item4", "item5"];
    const ungroupedItems = ["item6"];

    // Step 1: item1 from folder-A hovering over item4 in folder-B
    const step1Over: OverInfo = { overContainerId: "fB", overItemId: "item4" };

    // Folder A (source): item1 removed
    expect(computeProjectedIds(folderAItems, "fA", "item1", step1Over))
      .toEqual(["item2", "item3"]);
    // Folder B (target): item1 inserted before item4
    expect(computeProjectedIds(folderBItems, "fB", "item1", step1Over))
      .toEqual(["item1", "item4", "item5"]);
    // Ungrouped (uninvolved): unchanged
    expect(computeProjectedIds(ungroupedItems, null, "item1", step1Over))
      .toEqual(["item6"]);

    // Step 2: item1 now hovering over ungrouped (null container)
    const step2Over: OverInfo = { overContainerId: null, overItemId: "item6" };

    // Folder A (source): item1 removed
    expect(computeProjectedIds(folderAItems, "fA", "item1", step2Over))
      .toEqual(["item2", "item3"]);
    // Folder B (uninvolved): unchanged
    expect(computeProjectedIds(folderBItems, "fB", "item1", step2Over))
      .toEqual(["item4", "item5"]);
    // Ungrouped (target): item1 inserted before item6
    expect(computeProjectedIds(ungroupedItems, null, "item1", step2Over))
      .toEqual(["item1", "item6"]);

    // Step 3: item1 hovering back over folder-B again
    const step3Over: OverInfo = { overContainerId: "fB", overItemId: "item5" };

    expect(computeProjectedIds(folderAItems, "fA", "item1", step3Over))
      .toEqual(["item2", "item3"]);
    expect(computeProjectedIds(folderBItems, "fB", "item1", step3Over))
      .toEqual(["item4", "item1", "item5"]);
    expect(computeProjectedIds(ungroupedItems, null, "item1", step3Over))
      .toEqual(["item6"]);

    // Step 4: item1 hovering back to folder-A (home container)
    const step4Over: OverInfo = { overContainerId: "fA", overItemId: "item3" };

    // Now folder-A is both source AND target → same-container arrayMove
    expect(computeProjectedIds(folderAItems, "fA", "item1", step4Over))
      .toEqual(["item2", "item3", "item1"]);
    // Others remain uninvolved
    expect(computeProjectedIds(folderBItems, "fB", "item1", step4Over))
      .toEqual(["item4", "item5"]);
    expect(computeProjectedIds(ungroupedItems, null, "item1", step4Over))
      .toEqual(["item6"]);
  });

  // ---- Empty container edge case ----

  it("cross-container target into empty folder", () => {
    const over: OverInfo = { overContainerId: "empty-folder", overItemId: null };
    const result = computeProjectedIds([], "empty-folder", "a", over);
    expect(result).toEqual(["a"]);
  });
});
