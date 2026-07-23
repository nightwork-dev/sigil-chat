import { useState } from "react";
import { toast } from "sonner";
import { CircleAlertIcon } from "lucide-react";
import type { ManagedSkillDetail } from "@/lib/skills";
import { useDeleteSkill, useSkill, useUpsertSkill } from "@/lib/skills";
import { useResourceManager } from "@workspace/data/components/resource-manager";
import { DetailPanel } from "@workspace/data/components/detail-panel";
import { SkillSummary } from "@/features/skills-manager/skill-summary";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { Textarea } from "@workspace/ui/components/textarea";

/** Skill-summary-shaped item this feature hands to `ResourceManager.Root`. */
interface SkillListItem {
  id: string;
}

export function SkillDetailView() {
  const { selectedId, select } = useResourceManager<SkillListItem>();
  const skillQuery = useSkill(selectedId ?? undefined);

  if (skillQuery.isPending) {
    return (
      <>
        <DetailPanel.Header>
          <Skeleton className="h-5 w-40" />
        </DetailPanel.Header>
        <Skeleton className="h-48 w-full" />
      </>
    );
  }

  if (skillQuery.isError) {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Could not load skill</AlertTitle>
        <AlertDescription>
          {skillQuery.error instanceof Error
            ? skillQuery.error.message
            : "Unknown error"}
        </AlertDescription>
      </Alert>
    );
  }

  const result = skillQuery.data;
  if (!result || result.status === "not-found") {
    return (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertTitle>Skill not found</AlertTitle>
        <AlertDescription>
          It may have been deleted since this list loaded.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <SkillDetailForm
      key={`${result.skill.id}:${result.skill.revision}`}
      skill={result.skill}
      onDeleted={() => select(null)}
    />
  );
}

function SkillDetailForm({
  skill,
  onDeleted,
}: {
  skill: ManagedSkillDetail;
  onDeleted: () => void;
}) {
  const [body, setBody] = useState(skill.body);
  const upsert = useUpsertSkill();
  const del = useDeleteSkill();

  const isDirty = body !== skill.body;

  function handleSave() {
    if (!isDirty) return;
    upsert.mutate(
      {
        id: skill.id,
        scope: skill.scope,
        body,
        expectedRevision: skill.revision,
      },
      {
        onSuccess: (result) => {
          if (result.status === "ok") {
            toast.success(`Saved "${skill.name ?? skill.id}".`);
          } else {
            toast.error(result.message);
          }
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Failed to save skill.",
          );
        },
      },
    );
  }

  function handleDelete() {
    del.mutate(
      { id: skill.id, scope: skill.scope, expectedRevision: skill.revision },
      {
        onSuccess: (result) => {
          if (result.status === "ok") {
            toast.success(`Deleted "${skill.name ?? skill.id}".`);
            onDeleted();
          } else {
            toast.error(result.message);
          }
        },
        onError: (error) => {
          toast.error(
            error instanceof Error ? error.message : "Failed to delete skill.",
          );
        },
      },
    );
  }

  return (
    <>
      <DetailPanel.Header>
        <SkillSummary.Root skill={skill} className="space-y-1">
          <div className="flex items-center gap-2">
            <SkillSummary.Name className="text-base" />
            <SkillSummary.PinnedIndicator />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SkillSummary.ScopeBadge />
          </div>
          <SkillSummary.Description />
        </SkillSummary.Root>
      </DetailPanel.Header>

      <DetailPanel.Section title="Metadata">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{skill.version ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Author</dt>
            <dd className="truncate">{skill.author ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Used</dt>
            <dd>{skill.useCount ?? 0} times</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Updated</dt>
            <dd className="font-mono">
              {skill.updatedAt
                ? new Date(skill.updatedAt).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Origin</dt>
            <dd className="font-mono">{skill.origin.kind}</dd>
          </div>
        </dl>
      </DetailPanel.Section>

      <DetailPanel.Section title="Body">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-64 font-mono text-xs"
        />
      </DetailPanel.Section>

      <div className="flex items-center justify-between gap-2">
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button variant="ghost" className="text-destructive" />}
          >
            Delete
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete "{skill.name ?? skill.id}"?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This archives the skill rather than erasing it — it can be
                restored from the archive later. The agent will no longer see
                it as an active skill.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={del.isPending}
              >
                {del.isPending ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={handleSave} disabled={!isDirty || upsert.isPending}>
          {upsert.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </>
  );
}
