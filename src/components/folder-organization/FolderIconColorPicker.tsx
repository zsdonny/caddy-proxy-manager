"use client";

import React from "react";
import {
  Activity,
  Bookmark,
  Box,
  Cloud,
  Database,
  FolderOpen,
  HardDrive,
  Layers,
  Network,
  Server,
  Shield,
  Star,
  Tag,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Icon registry
// ---------------------------------------------------------------------------

const FOLDER_ICONS: Record<string, LucideIcon> = {
  folder: FolderOpen,
  server: Server,
  cloud: Cloud,
  network: Network,
  layers: Layers,
  shield: Shield,
  activity: Activity,
  star: Star,
  tag: Tag,
  bookmark: Bookmark,
  box: Box,
  zap: Zap,
  database: Database,
  "hard-drive": HardDrive,
};

export const FOLDER_ICON_KEYS = Object.keys(FOLDER_ICONS);

export function getFolderIcon(key?: string): LucideIcon {
  return FOLDER_ICONS[key ?? "folder"] ?? FolderOpen;
}

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

export const FOLDER_COLORS: { key: string; tw: string; label: string }[] = [
  { key: "amber",   tw: "bg-amber-400",   label: "Amber" },
  { key: "blue",    tw: "bg-blue-500",     label: "Blue" },
  { key: "emerald", tw: "bg-emerald-500",  label: "Emerald" },
  { key: "rose",    tw: "bg-rose-500",     label: "Rose" },
  { key: "purple",  tw: "bg-purple-500",   label: "Purple" },
  { key: "cyan",    tw: "bg-cyan-500",     label: "Cyan" },
  { key: "orange",  tw: "bg-orange-500",   label: "Orange" },
  { key: "zinc",    tw: "bg-zinc-400",     label: "Zinc" },
  { key: "red",     tw: "bg-red-500",      label: "Red" },
  { key: "indigo",  tw: "bg-indigo-500",   label: "Indigo" },
  { key: "teal",    tw: "bg-teal-500",     label: "Teal" },
  { key: "pink",    tw: "bg-pink-500",     label: "Pink" },
];

/** Maps a stored color key to the Tailwind `text-*` class used on the icon. */
export function getFolderColorClass(key?: string): string {
  switch (key) {
    case "blue":    return "text-blue-500";
    case "emerald": return "text-emerald-500";
    case "rose":    return "text-rose-500";
    case "purple":  return "text-purple-500";
    case "cyan":    return "text-cyan-500";
    case "orange":  return "text-orange-500";
    case "zinc":    return "text-zinc-400";
    case "red":     return "text-red-500";
    case "indigo":  return "text-indigo-500";
    case "teal":    return "text-teal-500";
    case "pink":    return "text-pink-500";
    default:        return "text-amber-400";    // amber / default
  }
}

// ---------------------------------------------------------------------------
// Picker component
// ---------------------------------------------------------------------------

export function FolderIconColorPicker({
  icon,
  color,
  onChange,
  children,
}: {
  icon?: string;
  color?: string;
  onChange: (patch: { icon?: string; color?: string }) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const currentIcon = icon ?? "folder";
  const currentColor = color ?? "amber";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start" sideOffset={4}>
        {/* Colors */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Color</p>
        <div className="grid grid-cols-6 gap-2.5 mb-3">
          {FOLDER_COLORS.map(c => (
            <button
              key={c.key}
              onClick={() => onChange({ color: c.key })}
              title={c.label}
              className={cn(
                "h-6 w-6 rounded-full transition-transform hover:scale-110",
                c.tw,
                currentColor === c.key && "ring-2 ring-offset-2 ring-offset-background ring-foreground/50 scale-110",
              )}
            />
          ))}
        </div>

        {/* Icons */}
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">Icon</p>
        <div className="grid grid-cols-7 gap-1.5">
          {FOLDER_ICON_KEYS.map(key => {
            const Icon = FOLDER_ICONS[key];
            return (
              <button
                key={key}
                onClick={() => onChange({ icon: key })}
                title={key}
                className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-md transition-colors",
                  "hover:bg-muted",
                  currentIcon === key
                    ? "bg-muted ring-1 ring-foreground/20"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
