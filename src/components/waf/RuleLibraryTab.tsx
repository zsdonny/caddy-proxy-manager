"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import { AppDialog } from "@/components/ui/AppDialog";
import { RuleSetDialog, type RuleSetItem } from "./RuleSetDialog";
import { deleteWafRuleSetAction } from "@/app/(dashboard)/settings/actions";

type Props = {
  ruleSets: RuleSetItem[];
};

export function RuleLibraryTab({ ruleSets }: Props) {
  const router = useRouter();
  const [editItem, setEditItem] = useState<RuleSetItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<RuleSetItem | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!deleteItem) return;
    startTransition(async () => {
      const result = await deleteWafRuleSetAction(deleteItem.id);
      if (result.success) {
        toast.success("Rule set deleted");
        router.refresh();
      } else {
        toast.error(result.message ?? "Failed to delete");
      }
      setDeleteItem(null);
    });
  }

  const columns = [
    {
      id: "name",
      label: "Name",
      sortKey: "name",
      render: (row: RuleSetItem) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.isPreset && (
            <Badge variant="secondary" className="text-[0.65rem] px-1.5 py-0">
              <Lock className="h-2.5 w-2.5 mr-0.5" />
              Preset
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "description",
      label: "Description",
      render: (row: RuleSetItem) => (
        <span className="text-muted-foreground text-sm">{row.description || "—"}</span>
      ),
    },
    {
      id: "updatedAt",
      label: "Updated",
      sortKey: "updatedAt",
      render: (row: RuleSetItem) => (
        <span className="text-muted-foreground text-sm">
          {new Date(row.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "actions",
      label: "",
      render: (row: RuleSetItem) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditItem(row)}>
            <Pencil className="h-4 w-4" />
          </Button>
          {!row.isPreset && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteItem(row)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Rule Library</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable SecLang rule sets. Assign them to global WAF settings or individual proxy hosts.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Create Rule Set
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={ruleSets}
        keyField="id"
        emptyMessage="No rule sets yet. Create one or presets will appear after the first WAF configuration save."
      />

      <RuleSetDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <RuleSetDialog
        open={!!editItem}
        onClose={() => setEditItem(null)}
        item={editItem}
      />

      <AppDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        title="Delete Rule Set"
        maxWidth="sm"
        actions={
          <>
            <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={isPending}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Are you sure you want to delete <strong>{deleteItem?.name}</strong>? Proxy hosts using this rule set will silently stop applying its directives.
        </p>
      </AppDialog>
    </div>
  );
}
