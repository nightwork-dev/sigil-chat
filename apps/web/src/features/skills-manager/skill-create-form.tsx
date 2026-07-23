import { useState } from "react";
import { toast } from "sonner";
import type { SkillScope } from "@workspace/agent-tools/skills";
import { useUpsertSkill } from "@/lib/skills";
import { Button } from "@workspace/ui/components/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import { DetailPanel } from "@workspace/data/components/detail-panel";

// Persona and session scopes require trusted Eve request context. This
// stateless owner workspace only exposes the application scopes it can bind.
const SKILL_SCOPES: readonly SkillScope[] = [
  "project",
  "directory",
  "global",
];

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function SkillCreateForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [id, setId] = useState("");
  const [scope, setScope] = useState<SkillScope>("project");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const upsert = useUpsertSkill();

  const idValid = ID_PATTERN.test(id);
  const canSubmit =
    idValid && description.trim().length > 0 && body.trim().length > 0;

  function handleSubmit() {
    if (!canSubmit) return;
    upsert.mutate(
      { id, scope, description: description.trim(), body },
      {
        onSuccess: (result) => {
          if (result.status === "ok") {
            toast.success(`Created skill "${id}".`);
            onCreated(id);
          } else {
            toast.error(result.message);
          }
        },
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "Failed to create skill.");
        },
      },
    );
  }

  return (
    <DetailPanel.Root>
      <DetailPanel.Header>
        <h2 className="text-sm font-medium">New skill</h2>
        <p className="text-xs text-muted-foreground">
          Authors a managed skill for the application agent.
        </p>
      </DetailPanel.Header>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="skill-id">Skill id</FieldLabel>
          <Input
            id="skill-id"
            value={id}
            onChange={(event) => setId(event.target.value.trim())}
            placeholder="editorial-readiness"
            aria-invalid={id.length > 0 && !idValid}
          />
          <FieldDescription>
            Lowercase letters, numbers, and hyphens. This becomes the skill's
            stable identifier.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="skill-scope">Scope</FieldLabel>
          <Select value={scope} onValueChange={(value) => setScope(value as SkillScope)}>
            <SelectTrigger id="skill-scope" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_SCOPES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="skill-description">Description</FieldLabel>
          <FieldContent>
            <Input
              id="skill-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="One sentence: when should the agent reach for this skill?"
            />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="skill-body">Body</FieldLabel>
          <Textarea
            id="skill-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Markdown skill content (frontmatter + instructions)"
            className="min-h-64 font-mono text-xs"
          />
        </Field>
      </FieldGroup>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={upsert.isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || upsert.isPending}>
          {upsert.isPending ? "Creating…" : "Create skill"}
        </Button>
      </div>
    </DetailPanel.Root>
  );
}
