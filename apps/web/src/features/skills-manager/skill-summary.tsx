import { createContext, useContext, type ReactNode } from "react";
import { PinIcon } from "lucide-react";
import type { ManagedSkillSummary } from "@/lib/skills";
import { Badge } from "@workspace/ui/components/badge";
import { cn } from "@workspace/ui/lib/utils";

/**
 * SkillSummary — compound Root/Parts component for the summary fields of a
 * managed skill (id, name, description, scope, origin, pinned state).
 *
 * Rendered in two different compositions today — the compact list row
 * (`SkillListRow`) and the detail panel header (`SkillDetailForm`) — so it
 * earns the Root/Parts treatment per this repo's mandatory standard rather
 * than staying a flat function duplicated in both places.
 */

const SkillSummaryContext = createContext<ManagedSkillSummary | null>(null);

function useSkillSummaryContext(): ManagedSkillSummary {
  const ctx = useContext(SkillSummaryContext);
  if (!ctx) {
    throw new Error("SkillSummary parts must be used inside <SkillSummary.Root>");
  }
  return ctx;
}

function Root({
  skill,
  children,
  className,
}: {
  skill: ManagedSkillSummary;
  children: ReactNode;
  className?: string;
}) {
  return (
    <SkillSummaryContext.Provider value={skill}>
      <div data-slot="skill-summary" className={cn(className)}>
        {children}
      </div>
    </SkillSummaryContext.Provider>
  );
}

function Name({ className }: { className?: string }) {
  const skill = useSkillSummaryContext();
  return (
    <span className={cn("truncate text-sm font-medium", className)}>
      {skill.name ?? skill.id}
    </span>
  );
}

function Description({ className }: { className?: string }) {
  const skill = useSkillSummaryContext();
  return (
    <p className={cn("text-sm leading-6 text-muted-foreground", className)}>
      {skill.description}
    </p>
  );
}

function ScopeBadge({ className }: { className?: string }) {
  const skill = useSkillSummaryContext();
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", className)}>
      {skill.scope}
    </Badge>
  );
}

function PinnedIndicator({ className }: { className?: string }) {
  const skill = useSkillSummaryContext();
  if (!skill.pinned) return null;
  return (
    <PinIcon
      aria-label="Pinned"
      className={cn("size-3.5 shrink-0 fill-current text-primary", className)}
    />
  );
}

export const SkillSummary = {
  Root,
  Name,
  Description,
  ScopeBadge,
  PinnedIndicator,
};
