import type { ManagedSkillSummary } from "@/lib/skills";
import { SkillSummary } from "@/features/skills-manager/skill-summary";

export function SkillListRow({ skill }: { skill: ManagedSkillSummary }) {
  return (
    <SkillSummary.Root skill={skill} className="grid gap-1 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <SkillSummary.Name />
        <SkillSummary.PinnedIndicator />
        <SkillSummary.ScopeBadge className="ml-auto shrink-0" />
      </div>
      <SkillSummary.Description className="line-clamp-2" />
    </SkillSummary.Root>
  );
}
