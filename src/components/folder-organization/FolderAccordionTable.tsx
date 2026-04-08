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
  FolderOpen,
  FolderClosed,
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
import { cn } from "@/lib/utils";
import type { UseFolderStateReturn, FolderItem } from "./useFolderState";
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
  return (
    <>
      <div
        className={cn(
          "h-full flex items-center mr-1 shrink-0 text-muted-foreground/40 transition-colors",
          inGroup ? "group-hover:text-muted-foreground/70" : "group-hover:text-muted-foreground/70",
        )}
        {...attributes}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
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
}: {
  item: T;
  itemId: string;
  columns: FolderColumn<T>[];
  animDelay?: number;
  inGroup?: boolean;
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

  return (
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
        inGroup && "border-b last:border-b-0 hover:bg-muted/40",
        !inGroup && "cursor-grab active:cursor-grabbing select-none",
        animDelay !== undefined &&
          "animate-in fade-in slide-in-from-top-1 duration-150 fill-mode-both",
        isDragging && "scale-[0.99] z-10",
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
}: {
  item: T;
  itemId: string;
  mobileCard: (item: T, dragHandle?: React.ReactNode) => React.ReactNode;
}) {
  const id = enc({ kind: "item", itemId });
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id });

  const dragHandle = (
    <div
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      className="flex items-center shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/60 touch-none"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      className="select-none"
      style={{
        transform: CSS.Transform.toString(isDragging ? null : transform),
        transition: isDragging ? undefined : transition,
        opacity: isDragging ? 0 : undefined,
      }}
    >
      {mobileCard(item, dragHandle)}
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
}) {
  const [draft, setDraft] = useState(folder.name);
  React.useEffect(() => setDraft(folder.name), [folder.name]);

  return (
    <div
      ref={activatorRef}
      {...(isRenaming ? {} : dragListeners)}
      className={cn(
        ROW_BASE,
        "group/folder border-b h-10 select-none px-3",
        isRenaming ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        "transition-colors duration-150",
        isOver && !isDraggingFolder ? "bg-muted/50" : "bg-muted/20 hover:bg-muted/35",
      )}
    >
      {/* Drag handle (visual + a11y) */}
      <div
        className="h-full flex items-center mr-1 shrink-0 text-muted-foreground/40 group-hover/folder:text-muted-foreground/70 transition-colors"
        {...dragAttributes}
        title="Drag to reorder folder"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

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

      {/* Folder icon */}
      <span className="ml-1 shrink-0">
        {folder.collapsed ? (
          <FolderClosed className="h-4 w-4 text-amber-400" />
        ) : (
          <FolderOpen className="h-4 w-4 text-amber-400" />
        )}
      </span>

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
              onClick={onDelete}
              title="Delete (items return to ungrouped)"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
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
        "grid transition-[grid-template-rows] duration-200 ease-out",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
      onTransitionEnd={(e) => {
        if (e.target === e.currentTarget && open) setFullyOpen(true);
      }}
    >
      <div className={fullyOpen ? undefined : "overflow-hidden"}>{children}</div>
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
  onToggle,
  onDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
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
  onToggle: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
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
      />

      <Accordion open={!folder.collapsed}>
        {displayItemIds.length === 0 && !isOverContainer ? (
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
  mobileCard,
  onToggle,
  onDelete,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: {
  folder: FolderItem;
  itemsById: Record<string, T>;
  /** Projected + sorted item IDs for this folder (computed by parent). */
  displayItemIds: string[];
  isRenaming: boolean;
  isDraggingFolder: boolean;
  isOverContainer: boolean;
  mobileCard: (item: T, dragHandle?: React.ReactNode) => React.ReactNode;
  onToggle: () => void;
  onDelete: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
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
      />
      <Accordion open={!folder.collapsed}>
        {displayItemIds.length === 0 && !isOverContainer ? (
          <div className="flex items-center h-9 px-4 border-t">
            <span className="text-xs text-muted-foreground/50 italic">
              Empty — drag items here
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3 border-t">
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
        isOverContainer && "bg-primary/5 rounded-md ring-1 ring-primary/30",
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
};

export function FolderAccordionTable<T extends { id: number | string }>({
  itemsById,
  folderState,
  columns,
  itemLabel,
  mobileCard,
  toolbar,
  emptyMessage = "No items",
  sort,
  onSort,
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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const activeDrag = React.useMemo((): DragId | null => {
    if (!activeId) return null;
    return dec(activeId);
  }, [activeId]);

  const isDraggingFolder = activeDrag?.kind === "folder";

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
   */
  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeDragInfo = dec(String(args.active.id));

      // Folder drag — only collide with other folder sortables
      if (activeDragInfo?.kind === "folder") {
        const folderIds = new Set(
          foldersRef.current.map(f => enc({ kind: "folder", folderId: f.id })),
        );
        const otherFolders = args.droppableContainers.filter(
          c => folderIds.has(String(c.id)) && String(c.id) !== String(args.active.id),
        );
        return closestCenter({ ...args, droppableContainers: otherFolders });
      }

      // Item drag — prefer item-level hits, fall back to container-level
      const pointerCandidates = pointerWithin(args);
      if (pointerCandidates.length === 0) return rectIntersection(args);

      const allItemIds = new Set<string>();
      for (const f of foldersRef.current) {
        for (const id of f.itemIds) allItemIds.add(enc({ kind: "item", itemId: id }));
      }
      for (const id of ungroupedRef.current) allItemIds.add(enc({ kind: "item", itemId: id }));

      const itemContainers = args.droppableContainers.filter(c =>
        allItemIds.has(String(c.id)),
      );
      const itemCandidates = pointerCandidates.filter(c =>
        allItemIds.has(String(c.id)),
      );
      if (itemCandidates.length > 0) {
        return closestCenter({ ...args, droppableContainers: itemContainers });
      }

      // No item hit — fall back to container-level hit (folder sortable / ungrouped)
      return pointerCandidates;
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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={({ active }: DragStartEvent) => {
        setActiveId(String(active.id));
        setOverContainerId(undefined);
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
                  onToggle={() => folderState.toggleFolder(folder.id)}
                  onDelete={() => folderState.deleteFolder(folder.id)}
                  onStartRename={() => folderState.startRename(folder.id)}
                  onCommitRename={name => folderState.commitRename(folder.id, name)}
                  onCancelRename={folderState.cancelRename}
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
                    mobileCard={mobileCard}
                    onToggle={() => folderState.toggleFolder(folder.id)}
                    onDelete={() => folderState.deleteFolder(folder.id)}
                    onStartRename={() => folderState.startRename(folder.id)}
                    onCommitRename={name => folderState.commitRename(folder.id, name)}
                    onCancelRename={folderState.cancelRename}
                  />
                ))}
              </SortableContext>
              <UngroupedDropZone className="gap-3 px-3" isDragging={!!activeId} isOverContainer={!isDraggingFolder && overContainerId === null}>
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
                      />
                    );
                  })}
                </SortableContext>
                {ungrouped.length === 0 && !!activeId && !isDraggingFolder && (
                  <div className="flex items-center h-8 px-3">
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
              "flex items-center h-11 w-fit max-w-sm px-3 rounded-md border bg-card shadow-2xl opacity-95 pointer-events-none",
              isDraggingFolder && "bg-muted/50",
            )}
          >
            {isDraggingFolder ? (
              <FolderOpen className="h-4 w-4 text-amber-400 mr-2 shrink-0" />
            ) : (
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 mr-2 shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{activeDragLabel}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
