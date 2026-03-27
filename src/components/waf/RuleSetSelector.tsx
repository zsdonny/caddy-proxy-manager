"use client";

import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { RuleSetItem } from "./RuleSetDialog";

type Props = {
  ruleSets: RuleSetItem[];
  selected: number[];
  onChange: (ids: number[]) => void;
  inputName?: string;
};

export function RuleSetSelector({ ruleSets, selected, onChange, inputName }: Props) {
  const [open, setOpen] = useState(false);

  if (ruleSets.length === 0) return null;

  const count = selected.length;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Applied Rule Sets</Label>
      <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
          <span className="text-muted-foreground">
            {count === 0 ? "None selected" : `${count} selected`}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-2 border-t px-3 py-3 max-h-48 overflow-y-auto">
            {ruleSets.map((rs) => {
              const checked = selected.includes(rs.id);
              return (
                <div key={rs.id} className="flex items-start gap-2">
                  <Checkbox
                    id={`rs-${rs.id}`}
                    checked={checked}
                    onCheckedChange={(v) => {
                      onChange(
                        v ? [...selected, rs.id] : selected.filter((id) => id !== rs.id)
                      );
                    }}
                  />
                  <div className="flex flex-col gap-0.5 leading-none">
                    <label htmlFor={`rs-${rs.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                      {rs.name}
                      {rs.isPreset && (
                        <Badge variant="secondary" className="text-[0.6rem] px-1 py-0">
                          <Lock className="h-2.5 w-2.5 mr-0.5" />
                          Preset
                        </Badge>
                      )}
                    </label>
                    {rs.description && (
                      <span className="text-xs text-muted-foreground">{rs.description}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
      {inputName && (
        <input type="hidden" name={inputName} value={JSON.stringify(selected)} />
      )}
    </div>
  );
}
