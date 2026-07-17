import { useState } from "react";
import {
  BotIcon,
  BracesIcon,
  CircleAlertIcon,
  SearchIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { useAgentCatalog } from "@/lib/agent-catalog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import { Input } from "@workspace/ui/components/input";
import { SectionHeader } from "@workspace/ui/components/section-header";
import { Separator } from "@workspace/ui/components/separator";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";

type CatalogKind = "skill" | "subagent";

interface CatalogEntryProps {
  kind: CatalogKind;
  name: string;
  description: string;
  sourcePath?: string;
  details: readonly string[];
}

function CatalogEntry({
  kind,
  name,
  description,
  sourcePath,
  details,
}: CatalogEntryProps) {
  const Icon = kind === "skill" ? BracesIcon : BotIcon;

  return (
    <article className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <h3 className="truncate text-sm font-medium">{name}</h3>
          <span className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted-foreground">
            {kind === "skill" ? "Authored skill" : "Declared subagent"}
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {sourcePath ? (
          <p className="mt-2 truncate font-mono text-[0.6875rem] text-muted-foreground">
            {sourcePath}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs text-muted-foreground sm:max-w-56 sm:justify-end">
        {details.map((detail) => (
          <span key={detail}>{detail}</span>
        ))}
      </div>
    </article>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3 p-4 sm:p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

export function SkillLibrary() {
  const catalog = useAgentCatalog();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const skills =
    catalog.data?.skills.filter(
      (skill) =>
        normalizedQuery.length === 0 ||
        `${skill.name} ${skill.description}`
          .toLowerCase()
          .includes(normalizedQuery),
    ) ?? [];
  const subagents =
    catalog.data?.subagents.filter(
      (subagent) =>
        normalizedQuery.length === 0 ||
        `${subagent.name} ${subagent.description}`
          .toLowerCase()
          .includes(normalizedQuery),
    ) ?? [];
  const resultCount = skills.length + subagents.length;

  if (catalog.isPending) return <LibrarySkeleton />;

  if (catalog.isError) {
    return (
      <div className="p-4 sm:p-6">
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Agent catalog unavailable</AlertTitle>
          <AlertDescription>
            {catalog.error instanceof Error
              ? catalog.error.message
              : "Eve did not return an inspection snapshot."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = catalog.data;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
        <SectionHeader action={<span>{data.agent.name}</span>}>
          Runtime capabilities
        </SectionHeader>

        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>Read-only runtime projection</AlertTitle>
          <AlertDescription>{data.management.explanation}</AlertDescription>
        </Alert>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Search agent capabilities</span>
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills and subagents"
              className="h-9 pl-9"
            />
          </label>
          <p className="shrink-0 text-xs text-muted-foreground">
            {resultCount} {resultCount === 1 ? "capability" : "capabilities"}
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card className="overflow-hidden py-0">
            <CardHeader className="border-b border-border px-4 py-4 sm:px-5">
              <CardTitle className="text-base">
                Available to the agent
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {resultCount === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No runtime capabilities match “{query}”.
                </p>
              ) : (
                <>
                  {skills.map((skill) => (
                    <CatalogEntry
                      key={`skill:${skill.id}`}
                      kind="skill"
                      name={skill.name}
                      description={skill.description}
                      sourcePath={skill.sourcePath}
                      details={["Model-discoverable", "Read-only catalog"]}
                    />
                  ))}
                  {subagents.map((subagent) => (
                    <CatalogEntry
                      key={`subagent:${subagent.id}`}
                      kind="subagent"
                      name={subagent.name}
                      description={subagent.description}
                      sourcePath={subagent.sourcePath}
                      details={[
                        "Delegatable",
                        `${subagent.summary.tools} authored tools`,
                        `${subagent.summary.skills} authored skills`,
                      ]}
                    />
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <aside className="h-fit rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium">Current boundary</h2>
            <Separator className="my-3" />
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Source</dt>
                <dd className="mt-1">Eve agent inspection</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Management</dt>
                <dd className="mt-1">Not yet available</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Model</dt>
                <dd
                  className={cn(
                    "mt-1 break-all font-mono text-xs",
                    !data.agent.model && "text-muted-foreground",
                  )}
                >
                  {data.agent.model ?? "Not reported"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Discovery health
                </dt>
                <dd className="mt-1">
                  {data.diagnostics.errors === 0 &&
                  data.diagnostics.warnings === 0
                    ? "No discovery issues"
                    : `${data.diagnostics.errors} errors, ${data.diagnostics.warnings} warnings`}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>
    </div>
  );
}
