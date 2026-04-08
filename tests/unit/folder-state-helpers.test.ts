import { describe, it, expect } from "vitest";
import {
  computeMoveItem,
  computeReorderFolder,
  computeReorderItemWithin,
} from "@/components/folder-organization/folder-state-helpers";
import type { FolderItem } from "@/components/folder-organization/useFolderState";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function mkFolder(id: string, itemIds: string[], name = id): FolderItem {
  return { id, name, collapsed: false, itemIds };
}

const FOLDERS: FolderItem[] = [
  mkFolder("fA", ["1", "2", "3"]),
  mkFolder("fB", ["4", "5"]),
  mkFolder("fC", []),
];
const UNGROUPED = ["6", "7"];

// ---------------------------------------------------------------------------
// computeMoveItem
// ---------------------------------------------------------------------------

describe("computeMoveItem", () => {
  it("moves item from ungrouped to a folder (end)", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "6", "fA");
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fA")!.itemIds).toEqual(["1", "2", "3", "6"]);
    expect(result!.ungrouped).toEqual(["7"]);
  });

  it("moves item from ungrouped to a folder at insertIndex", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "7", "fB", 0);
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fB")!.itemIds).toEqual(["7", "4", "5"]);
    expect(result!.ungrouped).toEqual(["6"]);
  });

  it("moves item from folder to ungrouped", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "1", null);
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fA")!.itemIds).toEqual(["2", "3"]);
    expect(result!.ungrouped).toEqual(["6", "7", "1"]);
  });

  it("moves item from folder to ungrouped at insertIndex 0", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "5", null, 0);
    expect(result).not.toBeNull();
    expect(result!.ungrouped).toEqual(["5", "6", "7"]);
  });

  it("moves item between folders", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "2", "fB", 1);
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fA")!.itemIds).toEqual(["1", "3"]);
    expect(result!.folders.find(f => f.id === "fB")!.itemIds).toEqual(["4", "2", "5"]);
  });

  it("moves item into empty folder", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "6", "fC");
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fC")!.itemIds).toEqual(["6"]);
  });

  it("returns null for no-op (same position)", () => {
    // Move "1" to folder "fA" at index 0 — it's already there
    const result = computeMoveItem(FOLDERS, UNGROUPED, "1", "fA", 0);
    expect(result).toBeNull();
  });

  it("clamps insertIndex to valid range", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "6", "fB", 999);
    expect(result).not.toBeNull();
    // Should end up at end of fB
    expect(result!.folders.find(f => f.id === "fB")!.itemIds).toEqual(["4", "5", "6"]);
  });

  it("clamps negative insertIndex to 0", () => {
    const result = computeMoveItem(FOLDERS, UNGROUPED, "6", "fB", -5);
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fB")!.itemIds).toEqual(["6", "4", "5"]);
  });
});

// ---------------------------------------------------------------------------
// computeReorderFolder
// ---------------------------------------------------------------------------

describe("computeReorderFolder", () => {
  it("moves folder forward", () => {
    // fA (index 0) to gap 2 → [fB, fA, fC]
    const result = computeReorderFolder(FOLDERS, "fA", 2);
    expect(result).not.toBeNull();
    expect(result!.map(f => f.id)).toEqual(["fB", "fA", "fC"]);
  });

  it("moves folder backward", () => {
    // fC (index 2) to gap 0 → [fC, fA, fB]
    const result = computeReorderFolder(FOLDERS, "fC", 0);
    expect(result).not.toBeNull();
    expect(result!.map(f => f.id)).toEqual(["fC", "fA", "fB"]);
  });

  it("returns null for no-op (same position)", () => {
    // fA at index 0, gap 0 → same position
    expect(computeReorderFolder(FOLDERS, "fA", 0)).toBeNull();
    // fA at index 0, gap 1 → moves to index 0 (gap after self)
    expect(computeReorderFolder(FOLDERS, "fA", 1)).toBeNull();
  });

  it("returns null for unknown folder", () => {
    expect(computeReorderFolder(FOLDERS, "unknown", 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeReorderItemWithin
// ---------------------------------------------------------------------------

describe("computeReorderItemWithin", () => {
  it("reorders items within a folder", () => {
    // In fA: move "1" to position of "3" — splice semantics:
    // remove "1" from index 0 → ["2","3"], insert at indexOf("3")=1 → ["2","3","1"]
    // This is correct: "1" goes to where "3" was, pushing "3" leftward is not
    // how splice works — it inserts before the found index in the shortened array.
    const result = computeReorderItemWithin(FOLDERS, UNGROUPED, "fA", "1", "3");
    expect(result).not.toBeNull();
    expect(result!.folders.find(f => f.id === "fA")!.itemIds).toEqual(["2", "3", "1"]);
  });

  it("reorders items within ungrouped", () => {
    const result = computeReorderItemWithin(FOLDERS, UNGROUPED, null, "7", "6");
    expect(result).not.toBeNull();
    expect(result!.ungrouped).toEqual(["7", "6"]);
  });

  it("returns null for no-op (same item)", () => {
    expect(computeReorderItemWithin(FOLDERS, UNGROUPED, "fA", "1", "1")).toBeNull();
  });

  it("returns null for unknown items", () => {
    expect(computeReorderItemWithin(FOLDERS, UNGROUPED, "fA", "unknown", "1")).toBeNull();
  });

  it("returns null for unknown container items", () => {
    expect(computeReorderItemWithin(FOLDERS, UNGROUPED, null, "unknown", "6")).toBeNull();
  });
});
