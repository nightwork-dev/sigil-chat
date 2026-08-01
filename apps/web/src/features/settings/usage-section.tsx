// Settings → Usage: the read-only ledger view (MDL.3 acceptance criterion 3).
//
// Table-first, same section language as ModelsSection: a rounded-border
// block per breakdown axis. No charting library — the story asks for
// dashboards later (OBS.1); this is the accounting record itself.

import { SectionHeader } from "@workspace/ui/components/section-header"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatTokenCount,
  formatUsd,
  useUsage,
  type UsageAggregateBucket,
  type UsageAggregateEntry,
  type UsageModelDescriptor,
} from "@/lib/usage"

export function UsageSection() {
  const usage = useUsage()

  if (usage.isPending) {
    return (
      <div className="flex max-w-3xl flex-col gap-6 p-4">
        <p className="text-xs text-muted-foreground">Loading usage…</p>
      </div>
    )
  }
  if (usage.isError) {
    return (
      <div className="flex max-w-3xl flex-col gap-6 p-4">
        <p className="text-xs text-destructive">
          The agent runtime did not answer. Usage is unavailable until it does.
        </p>
      </div>
    )
  }

  const { models, aggregates } = usage.data
  const modelLabel = modelLabelLookup(models)

  return (
    <div className="flex max-w-3xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <SectionHeader>Usage</SectionHeader>
        <TotalsRow bucket={aggregates.app} />
        <p className="text-xs text-muted-foreground">
          Every row below is metered from provider-reported token counts on
          completed turns. A turn the provider reported no usage for counts
          toward turns, not tokens — it is never estimated.{" "}
          {aggregates.app.turnCount > aggregates.app.reportedTurnCount ? (
            <>
              {aggregates.app.turnCount - aggregates.app.reportedTurnCount} of{" "}
              {aggregates.app.turnCount} recorded turns had no usage reported.
            </>
          ) : null}
        </p>
      </section>

      <BreakdownSection
        title="By model"
        entries={aggregates.byModel}
        keyLabel={(key) => modelLabel(key)}
      />
      <BreakdownSection
        title="By user"
        entries={aggregates.byUser}
        keyLabel={(key) => key}
      />
      <BreakdownSection
        title="By day"
        entries={aggregates.byDay}
        keyLabel={(key) => key}
      />
      <BreakdownSection
        title="By session"
        entries={aggregates.bySession}
        keyLabel={(key) => key}
        monospaceKey
      />
    </div>
  )
}

function modelLabelLookup(
  models: readonly UsageModelDescriptor[],
): (presetId: string) => string {
  const byId = new Map(models.map((model) => [model.presetId, model]))
  return (presetId) => {
    const model = byId.get(presetId)
    if (!model) return presetId
    return model.isDeploymentDefault
      ? `${model.label} (deployment default)`
      : model.label
  }
}

function TotalsRow({ bucket }: { bucket: UsageAggregateBucket }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Turns" value={bucket.turnCount.toLocaleString()} />
      <Stat label="Input tokens" value={formatTokenCount(bucket.inputTokens)} />
      <Stat
        label="Output tokens"
        value={formatTokenCount(bucket.outputTokens)}
      />
      <Stat
        label="Cost"
        value={
          bucket.pricedTurnCount > 0 ? formatUsd(bucket.costMicros) : "Unknown"
        }
        hint={
          bucket.pricedTurnCount < bucket.turnCount
            ? `${bucket.pricedTurnCount} of ${bucket.turnCount} turns priced`
            : undefined
        }
      />
    </div>
  )
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  )
}

function BreakdownSection({
  title,
  entries,
  keyLabel,
  monospaceKey,
}: {
  title: string
  entries: readonly UsageAggregateEntry[]
  keyLabel: (key: string) => string
  monospaceKey?: boolean
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <SectionHeader>{title}</SectionHeader>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No usage recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                {title === "By model" ? "Model" : title.replace("By ", "")}
              </TableHead>
              <TableHead className="text-right">Turns</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.key}>
                <TableCell
                  className={monospaceKey ? "font-mono text-xs" : "text-xs"}
                >
                  {keyLabel(entry.key)}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {entry.bucket.turnCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {formatTokenCount(entry.bucket.inputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {formatTokenCount(entry.bucket.outputTokens)}
                </TableCell>
                <TableCell className="text-right text-xs">
                  {entry.bucket.pricedTurnCount > 0
                    ? formatUsd(entry.bucket.costMicros)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
