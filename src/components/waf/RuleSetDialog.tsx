"use client";

import { useRef, useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { CircleX, AlertTriangle, ChevronDown, ClipboardCopy } from "lucide-react";

import { AppDialog } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { validateSecLangDirectives } from "@/src/lib/caddy-waf";
import { createWafRuleSetAction, updateWafRuleSetAction } from "@/app/(dashboard)/settings/actions";

const QUICK_TEMPLATES = [
  { label: "Allow IP", snippet: `SecRule REMOTE_ADDR "@ipMatch 1.2.3.4" "id:9000,phase:1,allow,nolog,msg:'Allow IP'"` },
  { label: "Disable WAF for path", snippet: `SecRule REQUEST_URI "@beginsWith /api/" "id:9001,phase:1,ctl:ruleEngine=Off,nolog"` },
  { label: "Remove XSS rules", snippet: `SecRuleRemoveByTag "attack-xss"` },
  { label: "Block User-Agent", snippet: `SecRule REQUEST_HEADERS:User-Agent "@contains badbot" "id:9002,phase:1,deny,status:403,log"` },
];

export type RuleSetItem = {
  id: number;
  name: string;
  description: string | null;
  directives: string;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  item?: RuleSetItem | null;
};

export function RuleSetDialog({ open, onClose, item }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [directives, setDirectives] = useState(item?.directives ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const isPreset = !!item?.isPreset;
  const isEdit = !!item;
  const [showTemplates, setShowTemplates] = useState(false);

  const secLangIssues = useMemo(() => validateSecLangDirectives(directives), [directives]);
  const hasErrors = secLangIssues.some(i => i.severity === "error");

  // Reset state when dialog opens with different item
  const lastItemId = useRef(item?.id);
  if (lastItemId.current !== item?.id) {
    lastItemId.current = item?.id;
    setDirectives(item?.directives ?? "");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const name = (fd.get("name") as string).trim();
    const description = (fd.get("description") as string).trim();
    setError(null);

    startTransition(async () => {
      const data = { name, description, directives: directives.trim() };
      const result = isEdit
        ? await updateWafRuleSetAction(item!.id, data)
        : await createWafRuleSetAction(data);
      if (!result.success) {
        setError(result.message ?? "Failed");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Rule Set" : "Create Rule Set"}
      maxWidth="md"
      actions={
        <>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button type="submit" form="rule-set-form" disabled={isPending || hasErrors}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form id="rule-set-form" ref={formRef} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rs-name">Name</Label>
          <Input
            id="rs-name"
            name="name"
            defaultValue={item?.name ?? ""}
            placeholder="e.g. WordPress Relaxation"
            required
            readOnly={isPreset}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rs-desc">Description</Label>
          <Input
            id="rs-desc"
            name="description"
            defaultValue={item?.description ?? ""}
            placeholder="Optional description"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rs-directives">SecLang Directives</Label>
          <Textarea
            id="rs-directives"
            name="directives"
            rows={8}
            value={directives}
            onChange={(e) => setDirectives(e.target.value)}
            placeholder={`SecRule REQUEST_URI "@beginsWith /api/" "id:9001,phase:1,ctl:ruleEngine=Off,nolog"`}
            className={cn("font-mono text-[0.8rem] resize-y", hasErrors && "border-red-500")}
          />
          {secLangIssues.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              {secLangIssues.map((issue, i) => (
                <p key={i} className={cn("text-xs flex items-start gap-1", issue.severity === "error" ? "text-red-500" : "text-amber-500")}>
                  {issue.severity === "error" ? <CircleX className="h-3.5 w-3.5 shrink-0 mt-px" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />}
                  <span>Line {issue.line}: {issue.message}</span>
                </p>
              ))}
            </div>
          )}
        </div>
        {/* Quick Templates */}
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowTemplates((v) => !v)}
            className="text-muted-foreground px-0 text-sm"
          >
            Quick Templates
            <ChevronDown className={cn(
              "h-4 w-4 ml-1 transition-transform duration-200",
              showTemplates && "rotate-180"
            )} />
          </Button>
          <div className={cn(
            "overflow-hidden transition-all duration-200",
            showTemplates ? "max-h-[500px] opacity-100 mt-2" : "max-h-0 opacity-0 pointer-events-none"
          )}>
            <div className="flex flex-col gap-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <Button
                  key={t.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setDirectives((prev) => prev ? `${prev}\n${t.snippet}` : t.snippet)}
                  className="justify-start font-mono text-[0.72rem]"
                >
                  <ClipboardCopy className="h-3 w-3 mr-1 shrink-0" />
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </AppDialog>
  );
}
