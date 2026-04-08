/**
 * Pure state-transition helpers for folder organisation.
 *
 * Extracted from useFolderState so the critical move/reorder logic can be
 * unit-tested without React or renderHook.
 */

import type { FolderItem } from "./useFolderState";

// ---------------------------------------------------------------------------
// moveItem — pure computation
// ---------------------------------------------------------------------------

export type MoveResult = {
  folders: FolderItem[];
  ungrouped: string[];
};

/**
 * Compute the next folder/ungrouped state after moving `itemId` into the
 * container identified by `toFolderId` (null = ungrouped) at `insertIndex`.
 *
 * Returns `null` if the move is a no-op (item is already at that position).
 */
export function computeMoveItem(
  folders: FolderItem[],
  ungrouped: string[],
  itemId: string,
  toFolderId: string | null,
  insertIndex?: number,
): MoveResult | null {
  const sameIds = (a: string[], b: string[]): boolean =>
    a.length === b.length && a.every((id, i) => id === b[i]);
  const sameFolders = (a: FolderItem[], b: FolderItem[]): boolean =>
    a.length === b.length &&
    a.every((f, i) => {
      const g = b[i];
      return (
        !!g &&
        f.id === g.id &&
        f.name === g.name &&
        f.collapsed === g.collapsed &&
        sameIds(f.itemIds, g.itemIds)
      );
    });

  // Remove item from wherever it currently lives
  const nextFolders = folders.map(f => ({
    ...f,
    itemIds: f.itemIds.filter(i => i !== itemId),
  }));
  const nextUngrouped = ungrouped.filter(i => i !== itemId);

  if (toFolderId === null) {
    const final = [...nextUngrouped];
    const idx =
      insertIndex === undefined
        ? final.length
        : Math.max(0, Math.min(insertIndex, final.length));
    final.splice(idx, 0, itemId);
    if (sameFolders(folders, nextFolders) && sameIds(ungrouped, final)) {
      return null; // no-op
    }
    return { folders: nextFolders, ungrouped: final };
  }

  const withItem = nextFolders.map(f => {
    if (f.id !== toFolderId) return f;
    const ids = [...f.itemIds];
    const idx =
      insertIndex === undefined
        ? ids.length
        : Math.max(0, Math.min(insertIndex, ids.length));
    ids.splice(idx, 0, itemId);
    return { ...f, itemIds: ids };
  });
  if (sameFolders(folders, withItem) && sameIds(ungrouped, nextUngrouped)) {
    return null; // no-op
  }
  return { folders: withItem, ungrouped: nextUngrouped };
}

// ---------------------------------------------------------------------------
// reorderFolder — pure computation
// ---------------------------------------------------------------------------

/**
 * Compute the next folders array after moving a folder from its current
 * position to gap slot `toGap` (0 = before first folder).
 *
 * Returns `null` if the reorder is a no-op.
 */
export function computeReorderFolder(
  folders: FolderItem[],
  folderId: string,
  toGap: number,
): FolderItem[] | null {
  const fromIndex = folders.findIndex(f => f.id === folderId);
  if (fromIndex === -1) return null;
  const insertAt = toGap > fromIndex ? toGap - 1 : toGap;
  if (fromIndex === insertAt) return null;
  const next = [...folders];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(insertAt, 0, removed);
  return next;
}

// ---------------------------------------------------------------------------
// reorderItemWithin — pure computation
// ---------------------------------------------------------------------------

/**
 * Compute the next state after reordering `fromItemId` to the position of
 * `toItemId` within the same container.
 *
 * Returns `null` if the reorder is a no-op.
 */
export function computeReorderItemWithin(
  folders: FolderItem[],
  ungrouped: string[],
  containerId: string | null,
  fromItemId: string,
  toItemId: string,
): MoveResult | null {
  if (containerId === null) {
    const fromIdx = ungrouped.indexOf(fromItemId);
    const toIdx = ungrouped.indexOf(toItemId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;
    const next = [...ungrouped];
    const [item] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    return { folders, ungrouped: next };
  }

  const nextFolders = folders.map(f => {
    if (f.id !== containerId) return f;
    const fromIdx = f.itemIds.indexOf(fromItemId);
    const toIdx = f.itemIds.indexOf(toItemId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return f;
    const ids = [...f.itemIds];
    const [item] = ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, item);
    return { ...f, itemIds: ids };
  });
  // Check if anything actually changed
  if (nextFolders.every((f, i) => f === folders[i])) return null;
  return { folders: nextFolders, ungrouped };
}
