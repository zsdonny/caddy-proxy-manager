"use client";

import { useCallback, useId, useRef, useState } from "react";
import type { FolderStateData } from "@/lib/models/user-preferences";
import {
  computeMoveItem,
  computeReorderFolder,
  computeReorderItemWithin,
} from "./folder-state-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** In-memory folder record — richer than the serialised persistence format. */
export type FolderItem = {
  id: string;
  name: string;
  collapsed: boolean;
  itemIds: string[];
};

export type UseFolderStateReturn<T> = {
  folders: FolderItem[];
  ungrouped: string[];
  toggleFolder: (id: string) => void;
  moveItem: (itemId: string, toFolderId: string | null, insertIndex?: number) => void;
  /** Re-order folders: move the folder at `folderId` so it occupies gap slot `toGap` (0 = before first folder). */
  reorderFolder: (folderId: string, toGap: number) => void;
  /** Reorder an item within its container — move `fromItemId` to the position of `toItemId`. */
  reorderItemWithin: (containerId: string | null, fromItemId: string, toItemId: string) => void;
  createFolder: () => void;
  deleteFolder: (id: string) => void;
  startRename: (id: string) => void;
  commitRename: (id: string, name: string) => void;
  cancelRename: () => void;
  renamingFolderId: string | null;
};

// ---------------------------------------------------------------------------
// useFolderState
// ---------------------------------------------------------------------------

/**
 * Client-side folder organisation state hook.
 *
 * @param initialData   Persisted folder state from DB.  May be null if the user has
 *                      no saved preferences yet.
 * @param allItemIds    All visible item IDs — items not assigned in `initialData`
 *                      will be appended to the ungrouped list automatically.
 * @param onStateChange Called after every mutation with the serialisable state to
 *                      persist.  The caller should debounce this before sending to
 *                      the server.
 */
export function useFolderState<T extends { id: number | string }>(
  initialData: FolderStateData | null,
  allItemIds: string[],
  onStateChange?: (state: FolderStateData) => void,
): UseFolderStateReturn<T> {
  const uid = useId();
  const counter = useRef(0);
  const mkId = () => `f-${uid}-${++counter.current}`;

  const [folders, setFolders] = useState<FolderItem[]>(() => {
    if (!initialData) return [];
    return initialData.folders.map((f, i) => ({
      id: `f-${uid}-init-${i}`,
      name: f.name,
      collapsed: false,
      itemIds: f.itemIds,
    }));
  });

  const [ungrouped, setUngrouped] = useState<string[]>(() => {
    if (!initialData) return [...allItemIds];
    const assigned = new Set(initialData.folders.flatMap(f => f.itemIds));
    // Items saved in the pref that aren't in any folder
    const fromPref = initialData.ungrouped.filter(id => !assigned.has(id) && allItemIds.includes(id));
    // Items that exist now but weren't in the saved prefs at all — add at end
    const inPref = new Set([...assigned, ...initialData.ungrouped]);
    const newItems = allItemIds.filter(id => !inPref.has(id));
    return [...fromPref, ...newItems];
  });

  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Refs so callbacks don't need folders/ungrouped as deps (avoids identity churn)
  // ---------------------------------------------------------------------------
  const foldersRef = useRef(folders);
  const ungroupedRef = useRef(ungrouped);
  foldersRef.current = folders;
  ungroupedRef.current = ungrouped;

  const emitChange = useCallback(
    (nextFolders: FolderItem[], nextUngrouped: string[]) => {
      onStateChange?.({
        folders: nextFolders.map(f => ({ name: f.name, itemIds: f.itemIds })),
        ungrouped: nextUngrouped,
      });
    },
    [onStateChange],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const toggleFolder = useCallback(
    (id: string) =>
      setFolders(prev => prev.map(f => f.id === id ? { ...f, collapsed: !f.collapsed } : f)),
    [],
  );

  const moveItem = useCallback(
    (itemId: string, toFolderId: string | null, insertIndex?: number) => {
      const result = computeMoveItem(
        foldersRef.current,
        ungroupedRef.current,
        itemId,
        toFolderId,
        insertIndex,
      );
      if (!result) return; // no-op
      emitChange(result.folders, result.ungrouped);
      setFolders(result.folders);
      setUngrouped(result.ungrouped);
    },
    [emitChange],
  );

  const reorderFolder = useCallback(
    (folderId: string, toGap: number) => {
      const next = computeReorderFolder(foldersRef.current, folderId, toGap);
      if (!next) return; // no-op
      emitChange(next, ungroupedRef.current);
      setFolders(next);
    },
    [emitChange],
  );

  const reorderItemWithin = useCallback(
    (containerId: string | null, fromItemId: string, toItemId: string) => {
      const result = computeReorderItemWithin(
        foldersRef.current,
        ungroupedRef.current,
        containerId,
        fromItemId,
        toItemId,
      );
      if (!result) return; // no-op
      setFolders(result.folders);
      setUngrouped(result.ungrouped);
      emitChange(result.folders, result.ungrouped);
    },
    [emitChange],
  );

  const createFolder = useCallback(() => {
    const id = mkId();
    const currentFolders = foldersRef.current;
    const next = [...currentFolders, { id, name: "New Folder", collapsed: false, itemIds: [] }];
    emitChange(next, ungroupedRef.current);
    setFolders(next);
    setRenamingFolderId(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitChange]);

  const deleteFolder = useCallback(
    (id: string) => {
      const currentFolders = foldersRef.current;
      const target = currentFolders.find(x => x.id === id);
      const nextFolders = currentFolders.filter(x => x.id !== id);
      const releasedIds = target ? target.itemIds : [];
      const nextUngrouped = [...ungroupedRef.current, ...releasedIds];
      emitChange(nextFolders, nextUngrouped);
      setFolders(nextFolders);
      setUngrouped(nextUngrouped);
    },
    [emitChange],
  );

  const startRename = useCallback((id: string) => setRenamingFolderId(id), []);

  const commitRename = useCallback(
    (id: string, name: string) => {
      const t = name.trim();
      if (t) {
        const next = foldersRef.current.map(f => f.id === id ? { ...f, name: t } : f);
        emitChange(next, ungroupedRef.current);
        setFolders(next);
      }
      setRenamingFolderId(null);
    },
    [emitChange],
  );

  const cancelRename = useCallback(() => setRenamingFolderId(null), []);

  return {
    folders,
    ungrouped,
    toggleFolder,
    moveItem,
    reorderFolder,
    reorderItemWithin,
    createFolder,
    deleteFolder,
    startRename,
    commitRename,
    cancelRename,
    renamingFolderId,
  };
}
