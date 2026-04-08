/**
 * Pure helpers for drag-and-drop folder organisation.
 *
 * Extracted from FolderAccordionTable so the projection logic that prevents
 * infinite render loops can be unit-tested without a React/DOM environment.
 */

import { arrayMove } from "@dnd-kit/sortable";

// ---------------------------------------------------------------------------
// Drag-id encoding
// ---------------------------------------------------------------------------

export type DragId =
  | { kind: "item"; itemId: string }
  | { kind: "folder"; folderId: string };

export const enc = (d: DragId): string => JSON.stringify(d);
export const dec = (raw: string | number): DragId | null => {
  try {
    return JSON.parse(String(raw)) as DragId;
  } catch {
    return null;
  }
};

export const GAP_PREFIX = "__gap_";
export const encGap = (index: number): string => `${GAP_PREFIX}${index}`;
export const decGap = (id: string): number | null => {
  if (!id.startsWith(GAP_PREFIX)) return null;
  const n = parseInt(id.slice(GAP_PREFIX.length), 10);
  return isNaN(n) ? null : n;
};

// ---------------------------------------------------------------------------
// Shallow array equality
// ---------------------------------------------------------------------------

/** Shallow array equality — used to stabilize projected ID arrays across renders. */
export function shallowEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Projection — the heart of the infinite-loop fix
// ---------------------------------------------------------------------------

export type OverInfo = {
  overContainerId: string | null;
  overItemId: string | null;
};

/**
 * Compute the projected display order for a container given the current drag state.
 *
 * This is the critical function: it must be a pure computation so its identity
 * inside useCallback is STABLE (keyed only on activeDraggedItemId). The caller
 * provides `baseIds` (items actually in the container) and `overInfo` (where the
 * user is hovering). The rules:
 *
 * - Same-container drag → arrayMove (swap active to over position)
 * - Cross-container source → remove active (siblings collapse)
 * - Cross-container target → insert active before overItem
 * - Uninvolved container → return baseIds unchanged
 *
 * @returns Projected item ID array for the given container.
 */
export function computeProjectedIds(
  baseIds: string[],
  containerId: string | null,
  activeDraggedItemId: string | null,
  overInfo: OverInfo | null,
): string[] {
  if (!activeDraggedItemId || !overInfo) return baseIds;

  const isSource = baseIds.includes(activeDraggedItemId);
  const isTarget = containerId === overInfo.overContainerId;

  // Same-container — arrayMove: active slot slides to over slot
  if (isSource && isTarget) {
    const fromIdx = baseIds.indexOf(activeDraggedItemId);
    if (overInfo.overItemId === null) {
      return [...baseIds.filter(id => id !== activeDraggedItemId), activeDraggedItemId];
    }
    const toIdx = baseIds.indexOf(overInfo.overItemId);
    if (toIdx === -1) return baseIds;
    return arrayMove([...baseIds], fromIdx, toIdx);
  }

  // Cross-container source: remove active so siblings collapse
  if (isSource) return baseIds.filter(id => id !== activeDraggedItemId);

  // Cross-container target: insert active before overItem
  if (isTarget) {
    if (overInfo.overItemId === null) return [...baseIds, activeDraggedItemId];
    const overIdx = baseIds.indexOf(overInfo.overItemId);
    if (overIdx === -1) return [...baseIds, activeDraggedItemId];
    const result = [...baseIds];
    result.splice(overIdx, 0, activeDraggedItemId);
    return result;
  }

  return baseIds;
}
