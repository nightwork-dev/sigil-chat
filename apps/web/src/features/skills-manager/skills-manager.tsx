import { useState } from "react";
import { PlusIcon, SearchIcon } from "lucide-react";
import type { ManagedSkillSummary } from "@/lib/skills";
import { useSkills } from "@/lib/skills";
import {
  ResourceManager,
  useResourceManager,
} from "@workspace/data/components/resource-manager";
import type { Column } from "@workspace/data/components/entity-table";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { SkillListRow } from "@/features/skills-manager/skill-list-row";
import { SkillCreateForm } from "@/features/skills-manager/skill-create-form";
import { SkillDetailView } from "@/features/skills-manager/skill-detail-view";

// EntityTable's Column type is required by ResourceManager.List's signature
// even when `renderRow` (used below) bypasses column rendering entirely —
// skills need scope/pin badges a generic table can't express.
const unusedColumns: Column<ManagedSkillSummary>[] = [
  { key: "name", label: "Name" },
  { key: "description", label: "Description" },
];

function matchesQuery(skill: ManagedSkillSummary, query: string): boolean {
  if (query.length === 0) return true;
  return `${skill.name ?? ""} ${skill.description} ${skill.id}`
    .toLowerCase()
    .includes(query);
}

export function SkillsManager() {
  const [query, setQuery] = useState("");
  const skillsQuery = useSkills();
  const normalizedQuery = query.trim().toLowerCase();
  const allSkills =
    skillsQuery.data?.status === "ok" ? skillsQuery.data.skills : [];
  const items = allSkills.filter((skill) => matchesQuery(skill, normalizedQuery));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <ResourceManager.Root
        items={items}
        isLoading={skillsQuery.isPending}
        isError={skillsQuery.isError}
        error={skillsQuery.error as Error | null}
        className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border"
      >
        <SkillsManagerBody
          query={query}
          onQueryChange={setQuery}
          resultCount={items.length}
        />
      </ResourceManager.Root>
    </div>
  );
}

function SkillsManagerBody({
  query,
  onQueryChange,
  resultCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  resultCount: number;
}) {
  const { selectedId, select } = useResourceManager<ManagedSkillSummary>();
  const [isCreating, setIsCreating] = useState(false);
  const showCreateForm = isCreating && selectedId === null;

  return (
    <>
      <ResourceManager.Toolbar>
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search skills</span>
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search skills"
            className="h-9 pl-9"
          />
        </label>
        <Button
          size="sm"
          onClick={() => {
            select(null);
            setIsCreating(true);
          }}
        >
          <PlusIcon className="size-4" />
          New skill
        </Button>
      </ResourceManager.Toolbar>

      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <ResourceManager.List
          columns={unusedColumns}
          renderRow={(skill) => <SkillListRow skill={skill} />}
          emptyMessage={
            resultCount === 0 && query.length > 0
              ? `No skills match "${query}".`
              : "No skills yet. Create one to get started."
          }
          className="border-b border-border lg:border-b-0 lg:border-r"
        />

        {showCreateForm ? (
          <SkillCreateForm
            onCancel={() => setIsCreating(false)}
            onCreated={(id) => {
              setIsCreating(false);
              select(id);
            }}
          />
        ) : (
          <ResourceManager.Detail
            empty={
              <ResourceManager.EmptyDetail>
                Select a skill to view or edit it, or create a new one.
              </ResourceManager.EmptyDetail>
            }
          >
            <SkillDetailView />
          </ResourceManager.Detail>
        )}
      </div>
    </>
  );
}
