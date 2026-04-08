/**
 * FolderAccordionTable — production component for drag-and-drop folder organisation.
 *
 * Features:
 *  • Item drag: drag any row into a folder (or back to ungrouped) across the whole table.
 *  • Folder reorder: drag a folder header to a gap slot to reorder folders.
 *  • Accordion: animated collapse/expand per folder.
 *  • Column sort: optional sort state fed in from the parent.
 *  • New Folder button, rename, delete — all with optimistic UI.
 */
"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AppDialog } from "@/components/ui/AppDialog";
import { cn } from "@/lib/utils";
import type { UseFolderStateReturn, FolderItem } from "./useFolderState";
import {
  FolderIconColorPicker,
  getFolderIcon,
  getFolderColorClass,
} from "./FolderIconColorPicker";
import {
  enc, dec,
  type DragId,
} from "./dnd-helpers";

// ---------------------------------------------------------------------------
// Column definition
// ---------------------------------------------------------------------------

/**
 * Each column carries a Tailwind `className` that sets width / padding for
 * both header cells and data cells — keeping every row aligned without a
 * real `<table>` element.
 */
export type FolderColumn<T> = {
  id: string;
  label: string;
  /** Tailwind classes for width, padding, alignment */
  className: string;
  render: (item: T) => React.ReactNode;
  /** If set, column is sortable — returns the comparable key for an item. */
  sortFn?: (item: T) => string | number | boolean;
  /** Custom header content (e.g. filter dropdown) — replaces the default label. */
  headerContent?: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Sort state
// ---------------------------------------------------------------------------

export type SortState = { columnId: string; dir: "asc" | "desc" } | null;

// ---------------------------------------------------------------------------
// Context: disable DnD
// ---------------------------------------------------------------------------

const DndDisabledCtx = React.createContext(false);

// ---------------------------------------------------------------------------
// Responsive hook — avoids duplicate sortable registrations
// ---------------------------------------------------------------------------

/** Returns true on md+ breakpoints (≥768px). SSR-safe: defaults to true. */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches);
    setDesktop(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return desktop;
}

// ---------------------------------------------------------------------------
// Row primitives
// ---------------------------------------------------------------------------

const ROW_BASE = "flex items-center w-full min-w-0";

/** Consistent sticky header row — matches the original DataTable header style. */
function HeaderRow<T>({
  columns,
  sort,
  onSort,
}: {
  columns: FolderColumn<T>[];
  sort?: SortState;
  onSort?: (columnId: string) => void;
}) {
  return (
    <div
      className={cn(
        ROW_BASE,
        "border-b bg-muted/30 text-xs font-medium text-muted-foreground tracking-wide h-10 px-3",
      )}
    >
      {/* Spacer matching the drag-handle column width */}
      <div className="w-5 shrink-0 mr-1" />
      {columns.map(col => {
        if (col.headerContent) {
          return (
            <div key={col.id} className={col.className}>
              {col.headerContent}
            </div>
          );
        }
        const sortable = !!col.sortFn && !!onSort;
        const isActive = sort?.columnId === col.id;
        return (
          <div key={col.id} className={col.className}>
            {sortable ? (
              <button
                onClick={() => onSort!(col.id)}
                className={cn(
                  "flex items-center gap-1 -ml-1 px-1 py-0.5 rounded hover:bg-muted/50 transition-colors",
                  isActive && "text-foreground",
                )}
              >
                {col.label}
                {isActive &&
                  (sort!.dir === "asc" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  ))}
              </button>
            ) : (
              col.label
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Memoized content layer for ItemRow.  Only re-renders when `item` or `columns`
 * change — intentionally isolated from drag-state props (transform, isDragging).
 *
 * This is the critical guard: React 19 calls ref-function cleanup + re-attach on
 * every render that produces a new ref-function identity.  Radix UI's Switch uses
 * `(node) => setButton(node)` internally (a new arrow each render), so any Switch
 * re-render during drag triggers setState → re-render → ref change → loop.
 * Keeping the column content here means it never re-renders just because the drag
 * transform changed.
 */
function ItemRowContentImpl<T extends { id: number | string }>({
  item,
  columns,
  attributes,
  inGroup,
}: {
  item: T;
  columns: FolderColumn<T>[];
  attributes: React.HTMLAttributes<HTMLElement>;
  inGroup: boolean;
}) {
  const dndDisabled = React.useContext(DndDisabledCtx);
  return (
    <>
      {!dndDisabled && (
        <div
          className={cn(
            "h-full flex items-center mr-1 shrink-0 text-muted-foreground/40 transition-colors",
            inGroup ? "group-hover:text-muted-foreground/70" : "group-hover:text-muted-foreground/70",
          )}
          {...attributes}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      {columns.map(col => (
        <div key={col.id} className={col.className}>
          {col.render(item)}
        </div>
      ))}
    </>
  );
}
const ItemRowContent = React.memo(ItemRowContentImpl) as typeof ItemRowContentImpl;

/**
 * Sortable item row — desktop table layout.
 *
 * `inGroup=true`  → flat row inside a folder card (border-b separator, no card border)
 * `inGroup=false` → standalone rounded card (ungrouped look)
 *
 * The drag wrapper (this component) re-renders freely on every drag move.
 * The column content (ItemRowContent) is memoized separately so Radix UI
 * components inside it (Switch etc.) never re-render during drag moves — this
 * prevents the React 19 ref-callback setState infinite loop.
 */
function ItemRowImpl<T extends { id: number | string }>({
  item,
  itemId,
  columns,
  animDelay,
  inGroup = false,
  isLeaving = false,
}: {
  item: T;
  itemId: string;
  columns: FolderColumn<T>[];
  animDelay?: number;
  inGroup?: boolean;
  /** True when this item is being dragged to a different container — collapse its placeholder. */
  isLeaving?: boolean;
}) {
  const id = enc({ kind: "item", itemId });
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  const content = (
    <ItemRowContent
      item={item}
      columns={columns}
      attributes={attributes as React.HTMLAttributes<HTMLElement>}
      inGroup={inGroup}
    />
  );

  // When the item is being dragged to another container, collapse its height
  // smoothly via grid-template-rows. The SortableContext items stay stable
  // (no measureRects loop) — this is purely visual.
  const shouldCollapse = isDragging && isLeaving;

  const inner = (
    <div
      ref={setNodeRef}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(isDragging ? null : transform),
        transition: isDragging ? undefined : transition,
        animationDelay: animDelay !== undefined ? `${animDelay}ms` : undefined,
        opacity: isDragging ? 0 : undefined,
      }}
      className={cn(
        inGroup
          ? ROW_BASE
          : "rounded-md ring-1 ring-border bg-card shadow-sm overflow-hidden",
        inGroup && "group select-none px-3 cursor-grab active:cursor-grabbing transition-colors duration-100",
        inGroup && "hover:bg-muted/40",
        inGroup && "border-t",
        !inGroup && "cursor-grab active:cursor-grabbing select-none",
        animDelay !== undefined &&
          "animate-in fade-in slide-in-from-top-1 duration-150 fill-mode-both",
        isDragging && "z-10",
      )}
    >
      {inGroup ? (
        content
      ) : (
        <div
          className={cn(
            ROW_BASE,
            "group select-none px-3 transition-colors duration-100 hover:bg-muted/40",
          )}
        >
          {content}
        </div>
      )}
    </div>
  );

  // Only wrap in grid collapse when this item is actively being dragged.
  // Non-dragged items render without the wrapper to avoid clipping transforms
  // during same-container reorder and to preserve ungrouped card styling.
  if (!isDragging) return inner;

  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-in-out"
      style={{ gridTemplateRows: shouldCollapse ? "0fr" : "1fr" }}
    >
      <div className="overflow-hidden">
        {inner}
      </div>
    </div>
  );
}
// Memo wrapper — preserves generic signature via cast
const ItemRow = React.memo(ItemRowImpl) as typeof ItemRowImpl;

/**
 * Mobile-only sortable item card — wraps the caller-supplied `mobileCard` renderer with
 * a grip handle. Only the grip handle triggers drag (via setActivatorNodeRef).
 *
 * Wrapped in React.memo for the same reason as ItemRow.
 */
function MobileItemCardImpl<T extends { id: number | string }>({
  item,
  itemId,
  mobileCard,
  isLeaving = false,
}: {
  item: T;
  itemId: string;
  mobileCard: (item: T, dragHandle?: React.ReactNode) => React.ReactNode;
  /** True when this item is being dragged to a different container — collapse its placeholder. */
  isLeaving?: boolean;
}) {
  const id = enc({ kind: "item", itemId });
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  const dndDisabled = React.useContext(DndDisabledCtx);
  const dragHandle = dndDisabled ? null : (
    <div
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 touch-none"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  );

  const shouldCollapse = isDragging && isLeaving;

  const inner = (
    <div
      ref={setNodeRef}
      className="select-none min-w-0"
      style={{
        transform: CSS.Transform.toString(isDragging ? null : transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0 : undefined,
      }}
    >
      {mobileCard(item, dragHandle)}
    </div>
  );

  if (!isDragging) return inner;

  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-in-out"
      style={{ gridTemplateRows: shouldCollapse ? "0fr" : "1fr" }}
    >
      <div className="overflow-hidden">
        {inner}
      </div>
    </div>
  );
}
const MobileItemCard = React.memo(MobileItemCardImpl) as typeof MobileItemCardImpl;

/**
 * Folder section header row — flat sticky-looking sub-header.
 * Folder icon stays amber for visual identity.
 */
function FolderRow({
  folder,
  isOver,
  isRenaming,
  isDraggingFolder,
  activatorRef,
  dragListeners,
  dragAttributes,
  onToggle,
  onDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAppearanceChange,
}: {
  folder: FolderItem;
  isOver: boolean;
  isRenaming: boolean;
  isDraggingFolder: boolean;
  activatorRef?: (node: HTMLElement | null) => void;
  dragListeners?: React.DOMAttributes<HTMLElement>;
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  onToggle: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (n: string) => void;
  onCancelRename: () => void;
  onAppearanceChange: (patch: { icon?: string; color?: string }) => void;
}) {
  const [draft, setDraft] = useState(folder.name);
  React.useEffect(() => setDraft(folder.name), [folder.name]);
  const dndDisabled = React.useContext(DndDisabledCtx);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
    <div
      ref={activatorRef}
      {...(isRenaming || dndDisabled ? {} : dragListeners)}
      className={cn(
        ROW_BASE,
        "group/folder h-10 select-none px-3",
        isRenaming || dndDisabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        "transition-colors duration-150",
        isOver && !isDraggingFolder ? "bg-muted/50" : "bg-muted/20 hover:bg-muted/35",
      )}
    >
      {/* Drag handle (visual + a11y) */}
      {!dndDisabled && (
        <div
          className="h-full flex items-center mr-1 shrink-0 text-muted-foreground/40 group-hover/folder:text-muted-foreground/70 transition-colors"
          {...dragAttributes}
          title="Drag to reorder folder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}

      {/* Chevron toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center h-6 w-6 shrink-0 rounded hover:bg-muted transition-colors"
        aria-label={folder.collapsed ? "Expand" : "Collapse"}
      >
        {folder.collapsed ? (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Folder icon — click to open icon/color picker */}
      <FolderIconColorPicker
        icon={folder.icon}
        color={folder.color}
        onChange={onAppearanceChange}
      >
        <button
          className="ml-1 shrink-0 rounded p-0.5 hover:bg-muted transition-colors"
          title="Change icon & color"
          onClick={e => e.stopPropagation()}
        >
          {React.createElement(getFolderIcon(folder.icon), {
            className: cn("h-4 w-4", getFolderColorClass(folder.color)),
          })}
        </button>
      </FolderIconColorPicker>

      {/* Name / rename input */}
      {isRenaming ? (
        <div className="flex items-center gap-1.5 ml-2 flex-1 min-w-0">
          <Input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") onCommitRename(draft);
              if (e.key === "Escape") onCancelRename();
            }}
            className="h-6 text-sm py-0 px-1.5 max-w-48"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => onCommitRename(draft)}
          >
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={onCancelRename}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <span
          className="ml-2 text-sm font-medium flex-1 min-w-0 truncate cursor-default"
          onDoubleClick={onStartRename}
          title="Double-click to rename"
        >
          {folder.name}
        </span>
      )}

      {/* Count + action buttons */}
      <div className="flex items-center gap-2 mr-1 shrink-0">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {folder.itemIds.length}
        </Badge>

        {!isRenaming && (
          <div className="flex gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={onStartRename}
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive/60 hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
              title="Delete (items return to ungrouped)"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>

    <AppDialog
      open={showDeleteConfirm}
      onClose={() => setShowDeleteConfirm(false)}
      title="Delete folder"
      maxWidth="xs"
      actions={
        <>
          <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => { setShowDeleteConfirm(false); onDelete(); }}
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">
        Delete <span className="font-medium text-foreground">{folder.name}</span>?
        {folder.itemIds.length > 0 && (
          <> Its {folder.itemIds.length} {folder.itemIds.length === 1 ? "item" : "items"} will return to ungrouped.</>
        )}
      </p>
    </AppDialog>
    </>
  );
}

/** Animated accordion wrapper — grid-template-rows trick avoids layout-breaking `display:none`. */
function Accordion({ open, children }: { open: boolean; children: React.ReactNode }) {
  // When fully open (after expand animation), drop overflow-hidden so
  // sticky cells inside can reach the outer overflow-x-auto scroll container.
  const [fullyOpen, setFullyOpen] = useState(open);

  React.useEffect(() => {
    if (!open) setFullyOpen(false);
  }, [open]);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out min-w-0",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && open) setFullyOpen(true);
      }}
    >
      <div className={cn("min-w-0", fullyOpen ? undefined : "overflow-hidden")}>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FolderSection
// ---------------------------------------------------------------------------

function FolderSection<T extends { id: number | string }>({
  folder,
  itemsById,
  columns,
  displayItemIds,
  isRenaming,
  isDraggingFolder,
  isOverContainer,
  leavingItemId,
  onToggle,
  onDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAppearanceChange,
}: {
  folder: FolderItem;
  itemsById: Record<string, T>;
  columns: FolderColumn<T>[];
  /** Projected + sorted item IDs for this folder (computed by parent). */
  displayItemIds: string[];
  isRenaming: boolean;
  isDraggingFolder: boolean;
  /** True when any dragged item is logically over this folder (parent-tracked). */
  isOverContainer: boolean;
  /** Item ID that is leaving its source container (CSS-collapse its row). */
  leavingItemId?: string;
  onToggle: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onAppearanceChange: (patch: { icon?: string; color?: string }) => void;
}) {
  // Sortable — allows folder reorder via row-shift animation within a parent
  // SortableContext.  Also serves as a droppable target for items being dragged
  // into the folder (the encoded folder ID is decoded in handleDragEnd).
  const sortableId = enc({ kind: "folder", folderId: folder.id });
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: sortableId });

  // Memoize so SortableContext receives a stable array reference.
  const sortableItems = useMemo(
    () => displayItemIds.map(id => enc({ kind: "item", itemId: id })),
    [displayItemIds],
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(isDragging ? null : transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0 : undefined,
      }}
      className={cn(
        "rounded-md shadow-sm overflow-hidden transition-colors duration-150",
        isOverContainer && !isDraggingFolder
          ? "ring-2 ring-primary/50 bg-primary/5"
          : "ring-1 ring-border bg-card",
      )}
    >
      <FolderRow
        folder={folder}
        isOver={isOverContainer}
        isRenaming={isRenaming}
        isDraggingFolder={isDraggingFolder}
        activatorRef={setActivatorNodeRef}
        dragListeners={listeners as unknown as React.DOMAttributes<HTMLElement>}
        dragAttributes={attributes as unknown as React.HTMLAttributes<HTMLElement>}
        onToggle={onToggle}
        onDelete={onDelete}
        onStartRename={onStartRename}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
        onAppearanceChange={onAppearanceChange}
      />

      <Accordion open={!folder.collapsed}>
        {displayItemIds.length === 0 ? (
          <div className="flex items-center h-9 px-4 border-t">
            <span className="text-xs text-muted-foreground/50 italic">
              Empty — drag items here
            </span>
          </div>
        ) : (
          <SortableContext
            items={sortableItems}
            strategy={verticalListSortingStrategy}
          >
            {displayItemIds.map((itemId, i) => {
              const item = itemsById[itemId];
              if (!item) return null;
              return (
                <ItemRow
                  key={itemId}
                  item={item}
                  itemId={itemId}
                  columns={columns}
                  inGroup
                  animDelay={i * 25}
                  isLeaving={itemId === leavingItemId}
                />
              );
            })}
          </SortableContext>
        )}
      </Accordion>
    </div>
  );
}

/**
 * Mobile-only folder section — same droppable + FolderRow header as the desktop version,
 * but renders items via the caller's `mobileCard` renderer instead of horizontal `ItemRow`s.
 */
function MobileFolderSection<T extends { id: number | string }>({
  folder,
  itemsById,
  displayItemIds,
  isRenaming,
  isDraggingFolder,
  isOverContainer,
  leavingItemId,
  mobileCard,
  onToggle,
  onDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onAppearanceChange,
}: {
  folder: FolderItem;
  itemsById: Record<string, T>;
  /** Projected + sorted item IDs for this folder (computed by parent). */
  displayItemIds: string[];
  isRenaming: boolean;
  isDraggingFolder: boolean;
  isOverContainer: boolean;
  /** Item ID that is leaving its source container (CSS-collapse its row). */
  leavingItemId?: string;
  mobileCard: (item: T, dragHandle?: React.ReactNode) => React.ReactNode;
  onToggle: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onAppearanceChange: (patch: { icon?: string; color?: string }) => void;
}) {
  const sortableId = enc({ kind: "folder", folderId: folder.id });
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: sortableId });

  const sortableItems = useMemo(
    () => displayItemIds.map(id => enc({ kind: "item", itemId: id })),
    [displayItemIds],
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(isDragging ? null : transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0 : undefined,
      }}
      className={cn(
        "rounded-md shadow-sm overflow-clip transition-colors duration-150",
        isOverContainer && !isDraggingFolder
          ? "ring-2 ring-primary/50 bg-primary/5"
          : "ring-1 ring-border bg-card",
      )}
    >
      <FolderRow
        folder={folder}
        isOver={isOverContainer}
        isRenaming={isRenaming}
        isDraggingFolder={isDraggingFolder}
        activatorRef={setActivatorNodeRef}
        dragListeners={listeners as unknown as React.DOMAttributes<HTMLElement>}
        dragAttributes={attributes as unknown as React.HTMLAttributes<HTMLElement>}
        onToggle={onToggle}
        onDelete={onDelete}
        onStartRename={onStartRename}
        onCommitRename={onCommitRename}
        onCancelRename={onCancelRename}
        onAppearanceChange={onAppearanceChange}
      />
      <Accordion open={!folder.collapsed}>
        {displayItemIds.length === 0 ? (
          <div className="flex items-center h-9 px-4 border-t">
            <span className="text-xs text-muted-foreground/50 italic">
              Empty — drag items here
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 px-1.5 py-2 border-t min-w-0">
            <SortableContext
              items={sortableItems}
              strategy={verticalListSortingStrategy}
            >
              {displayItemIds.map((itemId) => {
                const item = itemsById[itemId];
                if (!item) return null;
                return (
                  <MobileItemCard
                    key={itemId}
                    item={item}
                    itemId={itemId}
                    mobileCard={mobileCard}
                    isLeaving={itemId === leavingItemId}
                  />
                );
              })}
            </SortableContext>
          </div>
        )}
      </Accordion>
    </div>
  );
}

/**
 * Droppable zone for ungrouped items.  Items render as standalone rounded cards.
 */
function UngroupedDropZone({ children, className, isDragging, isOverContainer }: { children: React.ReactNode; className?: string; isDragging?: boolean; isOverContainer?: boolean }) {
  const { setNodeRef } = useDroppable({ id: "__ungrouped__" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col transition-colors duration-150",
        className || "gap-1.5",
        isOverContainer && "bg-primary/5 rounded-md ring-2 ring-primary/50",
        isDragging && "pt-1 min-h-[2.5rem]",
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DragOverlay modifier — positions ghost chip near the pointer
// ---------------------------------------------------------------------------

/**
 * Shifts the DragOverlay so the ghost's grip-icon area (12px from left, vertically
 * centred) tracks the cursor.  Without this the ghost anchors to the dragged
 * element's top-left rect, which looks wrong when dragging from the middle of a row.
 */
const snapGhostToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (activatorEvent instanceof MouseEvent && draggingNodeRect) {
    return {
      ...transform,
      x: transform.x + activatorEvent.clientX - draggingNodeRect.left - 12,
      y: transform.y + activatorEvent.clientY - (draggingNodeRect.top + draggingNodeRect.height / 2),
    };
  }
  return transform;
};

// ---------------------------------------------------------------------------
// FolderAccordionTable — main export
// ---------------------------------------------------------------------------

export type FolderAccordionTableProps<T extends { id: number | string }> = {
  itemsById: Record<string, T>;
  folderState: UseFolderStateReturn<T>;
  columns: FolderColumn<T>[];
  /** Returns the display label used in the drag overlay ghost card. */
  itemLabel: (item: T) => string;
  /** Optional: returns the sub-label (e.g. FQDN) shown under the name in the ghost pill. */
  itemSubLabel?: (item: T) => React.ReactNode;
  /** Optional: returns the status icon node shown to the left in the ghost pill (replaces grip icon). */
  itemIcon?: (item: T) => React.ReactNode;
  /**
   * Optional mobile card renderer. When provided, a card-based layout is shown on small
   * screens (<md breakpoint) with a GripVertical drag handle for long-press DnD.
   */
  mobileCard?: (item: T, dragHandle?: React.ReactNode) => React.ReactNode;
  /** Optional toolbar nodes rendered left of the "New Folder" button. */
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  sort?: SortState;
  onSort?: (columnId: string) => void;
  /** When true, disables all drag-and-drop (no sensors, no grip handles). */
  disableDnd?: boolean;
};

export function FolderAccordionTable<T extends { id: number | string }>({
  itemsById,
  folderState,
  columns,
  itemLabel,
  itemSubLabel,
  itemIcon,
  mobileCard,
  toolbar,
  emptyMessage = "No items",
  sort,
  onSort,
  disableDnd = false,
}: FolderAccordionTableProps<T>) {
  const { folders, ungrouped } = folderState;

  // Apply column-level sort to an array of item ids
  const sortItemIds = useCallback(
    (ids: string[]): string[] => {
      if (!sort) return ids;
      const col = columns.find(c => c.id === sort.columnId);
      if (!col?.sortFn) return ids;
      const fn = col.sortFn;
      const dir = sort.dir === "asc" ? 1 : -1;
      return [...ids].sort((a, b) => {
        const ia = itemsById[a];
        const ib = itemsById[b];
        if (!ia || !ib) return 0;
        const va = fn(ia);
        const vb = fn(ib);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    },
    [sort, columns, itemsById],
  );

  const isDesktop = useIsDesktop();

  const activeSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
  const noopSensors = useSensors();

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeDrag = React.useMemo((): DragId | null => {
    if (!activeId) return null;
    return dec(activeId);
  }, [activeId]);

  const isDraggingFolder = activeDrag?.kind === "folder";

  // Source container of the dragged item — set once on drag start, cleared on end.
  // Used to determine if the dragged item is "leaving" its container (pointer is
  // over a different container) so we can CSS-collapse its placeholder row.
  const activeSourceContainerRef = useRef<string | null | undefined>(undefined);

  const activeDragLabel = React.useMemo((): string | null => {
    if (!activeDrag) return null;
    if (activeDrag.kind === "item") {
      const item = itemsById[activeDrag.itemId];
      return item ? itemLabel(item) : null;
    }
    // folder drag
    const folder = folders.find(f => f.id === activeDrag.folderId);
    return folder ? folder.name : null;
  }, [activeDrag, itemsById, itemLabel, folders]);

  // The actual dragged item (undefined for folder drags) — used for ghost pill extras.
  const activeDragItem = React.useMemo((): T | undefined => {
    if (!activeDrag || activeDrag.kind !== "item") return undefined;
    return itemsById[activeDrag.itemId];
  }, [activeDrag, itemsById]);

  // The dragged folder (undefined for item drags) — used for ghost pill icon/color.
  const activeDragFolder = React.useMemo((): FolderItem | undefined => {
    if (!activeDrag || activeDrag.kind !== "folder") return undefined;
    return folders.find(f => f.id === activeDrag.folderId);
  }, [activeDrag, folders]);

  // Stable refs so collisionDetection/handleDragEnd never capture stale data.
  const foldersRef = useRef(folders);
  const ungroupedRef = useRef(ungrouped);
  foldersRef.current = folders;
  ungroupedRef.current = ungrouped;

  /**
   * Sorted item IDs per container — based on actual state, NOT projected.
   *
   * During drag, SortableContext items stay fixed (state doesn't mutate until
   * drop).  dnd-kit handles within-container visual reordering via transforms
   * automatically.  This eliminates the measureRects → setState → SortableContext
   * items change → measureRects infinite loop that plagued the projection approach.
   */
  const sortedContainerItems = useMemo(() => {
    const map = new Map<string | null, string[]>();
    for (const folder of folders) {
      map.set(folder.id, sortItemIds(folder.itemIds));
    }
    map.set(null, sortItemIds(ungrouped));
    return map;
  }, [folders, ungrouped, sortItemIds]);

  // Find which container (folder id or null = ungrouped) an item belongs to
  const findContainerForItem = useCallback(
    (itemId: string): string | null => {
      // Always read from ref so this is never stale during a drag
      const folder = foldersRef.current.find(f => f.itemIds.includes(itemId));
      return folder ? folder.id : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [], // stable — reads via foldersRef
  );

  // Track which container the pointer is logically over (for visual highlighting).
  // undefined = nothing, null = ungrouped, string = folder id.
  // Updated via onDragOver — this is purely visual and does NOT change
  // SortableContext items, so it cannot trigger the measureRects loop.
  const [overContainerId, setOverContainerId] = useState<string | null | undefined>(undefined);

  // Stable sortable IDs for the folder SortableContext (folder reorder).
  const folderSortableIds = useMemo(
    () => folders.map(f => enc({ kind: "folder", folderId: f.id })),
    [folders],
  );

  /**
   * Custom collision detection for multi-container sorting.
   *
   * Uses refs (not closure state) so the function identity is STABLE across
   * re-renders — prevents an infinite loop where moveItem updates folders →
   * new collisionDetection instance → dnd-kit re-fires drag events → repeat.
   *
   * Item drag priority: items → folder → ungrouped → nothing.
   * Strict priority prevents __ungrouped__ from ever stealing hits from folders.
   */
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeDragInfo = dec(String(args.active.id));

      // Folder drag — collide with all folder sortables (including self).
      // Including self allows closestCenter to return the active folder when
      // the pointer is back near its original position → "undo" the swap.
      // handleDragEnd guards with folderId !== drag.folderId for the drop.
      if (activeDragInfo?.kind === "folder") {
        const folderIds = new Set(
          foldersRef.current.map(f => enc({ kind: "folder", folderId: f.id })),
        );
        const allFolders = args.droppableContainers.filter(
          c => folderIds.has(String(c.id)),
        );
        return closestCenter({ ...args, droppableContainers: allFolders });
      }

      // Item drag — strict priority chain
      const pointerCandidates = pointerWithin(args);

      // Build ID sets for classification.
      // IMPORTANT: Exclude items inside collapsed folders. The Accordion uses
      // grid-rows-[0fr] + overflow:hidden — visually collapsed, but
      // getBoundingClientRect() still reports the items' full natural rects.
      // Those ghost rects bleed into subsequent folders and steal pointer hits,
      // causing items to land in the wrong container.
      const allItemIds = new Set<string>();
      for (const f of foldersRef.current) {
        if (!f.collapsed) {
          for (const id of f.itemIds) allItemIds.add(enc({ kind: "item", itemId: id }));
        }
      }
      for (const id of ungroupedRef.current) allItemIds.add(enc({ kind: "item", itemId: id }));

      const folderSortableIds = new Set(
        foldersRef.current.map(f => enc({ kind: "folder", folderId: f.id })),
      );

      // 1. Items — pointer is over a sortable item row.
      //    Only consider items whose rect contains the pointer (not ALL items
      //    globally) so closestCenter can't pick an item from another container.
      const itemCandidates = pointerCandidates.filter(c =>
        allItemIds.has(String(c.id)),
      );
      if (itemCandidates.length > 0) {
        const candidateIds = new Set(itemCandidates.map(c => String(c.id)));
        const itemContainers = args.droppableContainers.filter(c =>
          candidateIds.has(String(c.id)),
        );
        return closestCenter({ ...args, droppableContainers: itemContainers });
      }

      // 2. Folder — pointer is inside a folder card (header / empty body / gap)
      const folderCandidates = pointerCandidates.filter(c =>
        folderSortableIds.has(String(c.id)),
      );
      if (folderCandidates.length > 0) {
        return [folderCandidates[0]];
      }

      // 3. Ungrouped — pointer is inside the ungrouped zone
      const ungroupedCandidates = pointerCandidates.filter(c =>
        String(c.id) === "__ungrouped__",
      );
      if (ungroupedCandidates.length > 0) {
        return ungroupedCandidates;
      }

      // 4. Nothing under pointer (e.g. the gap between folder cards).
      // Only test against folder + ungrouped containers — NOT individual items.
      // rectIntersection on all containers would match items from nearby
      // folders whose rects partially overlap the pointer region, routing the
      // drop to the wrong container.
      const containerOnlyContainers = args.droppableContainers.filter(c => {
        const id = String(c.id);
        return folderSortableIds.has(id) || id === "__ungrouped__";
      });
      return rectIntersection({ ...args, droppableContainers: containerOnlyContainers });
    },
    [], // stable — reads via refs above
  );

  function handleDragOver({ over }: DragOverEvent) {
    if (!over) { setOverContainerId(undefined); return; }
    const overId = String(over.id);
    const overDrag = dec(overId);

    if (overDrag?.kind === "item") {
      setOverContainerId(findContainerForItem(overDrag.itemId));
    } else if (overId === "__ungrouped__") {
      setOverContainerId(null);
    } else if (overDrag?.kind === "folder") {
      setOverContainerId(overDrag.folderId);
    } else {
      setOverContainerId(undefined);
    }
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    setOverContainerId(undefined);
    activeSourceContainerRef.current = undefined;
    if (!over) return;

    const drag = dec(String(active.id));
    if (!drag) return;

    // Folder reorder via sortable
    if (drag.kind === "folder") {
      const overDec = dec(String(over.id));
      if (overDec?.kind === "folder" && overDec.folderId !== drag.folderId) {
        const fromIndex = foldersRef.current.findIndex(f => f.id === drag.folderId);
        const toIndex = foldersRef.current.findIndex(f => f.id === overDec.folderId);
        if (fromIndex !== -1 && toIndex !== -1) {
          const toGap = fromIndex < toIndex ? toIndex + 1 : toIndex;
          folderState.reorderFolder(drag.folderId, toGap);
        }
      }
      return;
    }

    // Item drag — determine target from the `over` element
    if (drag.kind === "item") {
      const overId = String(over.id);
      const overDrag = dec(overId);

      if (overDrag?.kind === "item") {
        // Dropped on/near another item
        const sourceContainer = findContainerForItem(drag.itemId);
        const targetContainer = findContainerForItem(overDrag.itemId);

        if (sourceContainer === targetContainer) {
          // Same-container reorder
          folderState.reorderItemWithin(sourceContainer, drag.itemId, overDrag.itemId);
        } else {
          // Cross-container move — insert at the over item's position
          const targetIds =
            targetContainer === null
              ? ungroupedRef.current
              : foldersRef.current.find(f => f.id === targetContainer)?.itemIds ?? [];
          const insertIndex = targetIds.indexOf(overDrag.itemId);
          folderState.moveItem(drag.itemId, targetContainer, insertIndex >= 0 ? insertIndex : undefined);
        }
      } else if (overId === "__ungrouped__") {
        // Dropped on the ungrouped zone (not on a specific item)
        folderState.moveItem(drag.itemId, null);
      } else if (overDrag?.kind === "folder") {
        // Dropped on a folder sortable (header/body, not on a specific item)
        folderState.moveItem(drag.itemId, overDrag.folderId);
      }
    }
  }

  const isEmpty = folders.length === 0 && ungrouped.length === 0;

  // Memoize ungrouped sortable items — stable during drag because
  // sortedContainerItems only changes when actual state changes (on drop).
  const ungroupedItemIds = sortedContainerItems.get(null) ?? [];
  const ungroupedSortableItems = useMemo(
    () => ungroupedItemIds.map(id => enc({ kind: "item", itemId: id })),
    [ungroupedItemIds],
  );

  // The item ID that is "leaving" its source container — pointer is over a
  // different container.  Used to CSS-collapse its placeholder row.
  // undefined = nothing leaving, string = item ID to collapse.
  const leavingItemId: string | undefined = (() => {
    if (!activeDrag || activeDrag.kind !== "item") return undefined;
    // overContainerId: undefined = nowhere, null = ungrouped, string = folder id
    if (overContainerId === undefined) return undefined;
    const src = activeSourceContainerRef.current;
    if (src === undefined) return undefined;
    // If pointer is over the same container the item came from, not leaving
    if (overContainerId === src) return undefined;
    return activeDrag.itemId;
  })();

  return (
    <DndDisabledCtx.Provider value={disableDnd}>
    <DndContext
      sensors={disableDnd ? noopSensors : activeSensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }: DragStartEvent) => {
        setActiveId(String(active.id));
        setOverContainerId(undefined);
        // Capture source container so we can detect "leaving"
        const d = dec(String(active.id));
        activeSourceContainerRef.current =
          d?.kind === "item" ? findContainerForItem(d.itemId) : undefined;
      }}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3">
        {toolbar}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={folderState.createFolder}
        >
          <Plus className="h-3.5 w-3.5" />
          New Folder
        </Button>
      </div>

      {/* Desktop table — only rendered when no mobileCard or on md+ screens */}
      {(!mobileCard || isDesktop) && (
      <div className="rounded-md ring-1 ring-border bg-card overflow-hidden">
        <HeaderRow columns={columns} sort={sort} onSort={onSort} />

        {isEmpty && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        )}

        {!isEmpty && (
          <div className="flex flex-col gap-1.5 p-3">
            <SortableContext items={folderSortableIds} strategy={verticalListSortingStrategy}>
              {folders.map((folder) => (
                <FolderSection
                  key={folder.id}
                  folder={folder}
                  itemsById={itemsById}
                  columns={columns}
                  displayItemIds={sortedContainerItems.get(folder.id) ?? []}
                  isRenaming={folderState.renamingFolderId === folder.id}
                  isDraggingFolder={isDraggingFolder}
                  isOverContainer={!isDraggingFolder && overContainerId === folder.id}
                  leavingItemId={leavingItemId}
                  onToggle={() => folderState.toggleFolder(folder.id)}
                  onDelete={() => folderState.deleteFolder(folder.id)}
                  onStartRename={() => folderState.startRename(folder.id)}
                  onCommitRename={name => folderState.commitRename(folder.id, name)}
                  onCancelRename={folderState.cancelRename}
                  onAppearanceChange={patch => folderState.setFolderAppearance(folder.id, patch)}
                />
              ))}
            </SortableContext>

            <UngroupedDropZone isDragging={!!activeId} isOverContainer={!isDraggingFolder && overContainerId === null}>
              <SortableContext
                items={ungroupedSortableItems}
                strategy={verticalListSortingStrategy}
              >
                {ungroupedItemIds.map((itemId) => {
                  const item = itemsById[itemId];
                  if (!item) return null;
                  return (
                    <ItemRow
                      key={itemId}
                      item={item}
                      itemId={itemId}
                      columns={columns}
                      isLeaving={itemId === leavingItemId}
                    />
                  );
                })}
              </SortableContext>
              {ungrouped.length === 0 && !!activeId && !isDraggingFolder && (
                <div className="flex items-center h-8 px-2">
                  <span className="text-xs text-muted-foreground/40 italic">Drag here to ungroup items</span>
                </div>
              )}
            </UngroupedDropZone>
          </div>
        )}
      </div>
      )}

      {/* Mobile card view — card-based layout with grip-handle DnD (<md screens) */}
      {mobileCard && !isDesktop && (
        <div className="flex flex-col gap-3">
          {isEmpty && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
          {!isEmpty && (
            <>
              <SortableContext items={folderSortableIds} strategy={verticalListSortingStrategy}>
                {folders.map((folder) => (
                  <MobileFolderSection
                    key={folder.id}
                    folder={folder}
                    itemsById={itemsById}
                    displayItemIds={sortedContainerItems.get(folder.id) ?? []}
                    isRenaming={folderState.renamingFolderId === folder.id}
                    isDraggingFolder={isDraggingFolder}
                    isOverContainer={!isDraggingFolder && overContainerId === folder.id}
                    leavingItemId={leavingItemId}
                    mobileCard={mobileCard}
                    onToggle={() => folderState.toggleFolder(folder.id)}
                    onDelete={() => folderState.deleteFolder(folder.id)}
                    onStartRename={() => folderState.startRename(folder.id)}
                    onCommitRename={name => folderState.commitRename(folder.id, name)}
                    onCancelRename={folderState.cancelRename}
                    onAppearanceChange={patch => folderState.setFolderAppearance(folder.id, patch)}
                  />
                ))}
              </SortableContext>
              <UngroupedDropZone className="gap-2.5 px-2" isDragging={!!activeId} isOverContainer={!isDraggingFolder && overContainerId === null}>
                <SortableContext
                  items={ungroupedSortableItems}
                  strategy={verticalListSortingStrategy}
                >
                  {ungroupedItemIds.map((itemId) => {
                    const item = itemsById[itemId];
                    if (!item) return null;
                    return (
                      <MobileItemCard
                        key={itemId}
                        item={item}
                        itemId={itemId}
                        mobileCard={mobileCard}
                        isLeaving={itemId === leavingItemId}
                      />
                    );
                  })}
                </SortableContext>
                {ungrouped.length === 0 && !!activeId && !isDraggingFolder && (
                  <div className="flex items-center h-8 px-2">
                    <span className="text-xs text-muted-foreground/40 italic">Drag here to ungroup items</span>
                  </div>
                )}
              </UngroupedDropZone>
            </>
          )}
        </div>
      )}

      {/* Drag overlay ghost */}
      <DragOverlay dropAnimation={null} modifiers={[snapGhostToCursor]}>
        {activeDragLabel && (
          <div
            className={cn(
              "flex items-center gap-2.5 h-11 w-fit max-w-sm px-3 rounded-md border bg-card shadow-2xl opacity-95 pointer-events-none",
              isDraggingFolder && "bg-muted/50",
            )}
          >
            {isDraggingFolder ? (
              React.createElement(getFolderIcon(activeDragFolder?.icon), {
                className: cn("h-4 w-4 shrink-0", getFolderColorClass(activeDragFolder?.color)),
              })
            ) : (
              <>
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                {activeDragItem && itemIcon && itemIcon(activeDragItem)}
              </>
            )}
            <div className="flex flex-col min-w-0 justify-center">
              <span className="text-sm font-medium truncate leading-tight">{activeDragLabel}</span>
              {activeDragItem && itemSubLabel && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate leading-tight">
                  {itemSubLabel(activeDragItem)}
                </span>
              )}
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
    </DndDisabledCtx.Provider>
  );
}
