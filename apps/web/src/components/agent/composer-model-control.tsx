// MDL.5 — the model this conversation runs, as a control rather than a label.
//
// It replaces two things that between them left a user unable to see or change
// their model from inside a chat: a passive 10px span rendered only in
// `hideHeader` mode and hidden below `sm`, and MDL.4's reasoning controls,
// which correctly render nothing for a model declaring no tunables but
// therefore leave the composer's model area empty.
//
// The trigger is ALWAYS present — in both header modes, at every width. That
// is the defect being fixed: a surface that disappears is not a surface. What
// varies is what the popover contains, and a model with nothing to tune says
// so in words instead of opening onto an empty box.
//
// Everything shown is RESOLVED state, never optimistic. The trigger reads
// `executionBinding.model` — what the server actually bound and what the
// signed per-turn proof will carry — and each mutation caches the thread the
// server returned. A refused change therefore leaves the real model on the
// trigger and puts the reason in the popover, rather than showing a selection
// that never took.

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"

import { DEPLOYMENT_DEFAULT_PRESET_ID } from "@workspace/runtime-env/constants"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { SectionHeader } from "@workspace/ui/components/section-header"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import { ToneChip } from "@workspace/ui/components/tone-chip"
import { cn } from "@workspace/ui/lib/utils"

import { useAgentRuntimeCatalog } from "@/lib/agent-catalog"
import {
  useSetAgentThreadModel,
  useSetAgentThreadRequestOptions,
  type AgentThread,
  type AgentThreadRequestOptions,
} from "@/lib/agent-threads"
import { useEnabledModelIds } from "@/lib/model-enablement"
import {
  findModelRecord,
  formatContextWindow,
  selectableModelProviders,
  useModelEndpoints,
  type ModelEndpointRecord,
} from "@/lib/model-endpoints"

/**
 * The bound model in trigger-width text.
 *
 * `provider/modelId` from the binding, exactly as the label it replaces read
 * it — the thread's own snapshot, never the deployment-wide catalog, which
 * misreports every session that chose something else. A thread that chose
 * nothing shows the runtime catalog's default, which IS what it runs.
 */
export function formatBoundModelLabel(
  thread: AgentThread | undefined,
  catalogModel: string | undefined,
): string {
  const bound = thread?.executionBinding?.model
  if (bound) return bound.modelId
  return catalogModel ?? "default model"
}

export function ComposerModelControl({
  className,
  thread,
}: {
  className?: string
  thread?: AgentThread
}) {
  const [open, setOpen] = useState(false)
  const catalog = useAgentRuntimeCatalog()
  const endpoints = useModelEndpoints()
  const enablement = useEnabledModelIds()
  const setModel = useSetAgentThreadModel()
  const setRequestOptions = useSetAgentThreadRequestOptions()

  const providers = endpoints.data?.providers ?? []
  const boundPresetId =
    thread?.executionBinding?.model?.presetId ?? DEPLOYMENT_DEFAULT_PRESET_ID
  const record = findModelRecord(providers, boundPresetId)
  const selectable = selectableModelProviders(
    providers,
    enablement.data?.enabledIds ?? [],
  )
  const label = formatBoundModelLabel(thread, catalog.data?.agent.model)
  const pending = setModel.isPending || setRequestOptions.isPending

  // A rebind that lost a revision race is the ordinary concurrent-edit case,
  // not a model problem — but the user still has to be told the model did not
  // change, which is what surfacing the server's own message does.
  const error = setModel.isError ? setModel.error : undefined

  function handleModelChange(presetId: string) {
    if (!thread || presetId === boundPresetId) return
    setModel.mutate({
      id: thread.id,
      ...(presetId === DEPLOYMENT_DEFAULT_PRESET_ID ? {} : { modelPresetId: presetId }),
      expectedRevision: thread.revision,
    })
  }

  function handleRequestOptions(next: AgentThreadRequestOptions) {
    if (!thread) return
    setRequestOptions.mutate({
      id: thread.id,
      requestOptions: { ...thread.requestOptions, ...next },
      expectedRevision: thread.revision,
    })
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <ToneChip
            aria-label={`Model: ${label}`}
            className={cn("min-w-0 font-mono", className)}
            title="Model, reasoning level, and fast mode"
            tone={error ? "destructive" : "muted"}
          />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3" side="top">
        <div className="flex flex-col gap-1.5">
          <SectionHeader>Model</SectionHeader>
          {endpoints.isPending || enablement.isPending ? (
            <p className="text-muted-foreground">Loading models…</p>
          ) : endpoints.isError ? (
            <p className="text-destructive">
              The agent runtime did not answer, so the model list is
              unavailable. The conversation keeps the model it is bound to.
            </p>
          ) : selectable.length === 0 ? (
            <p className="text-muted-foreground">
              No models are available to choose. An owner enables them in
              Settings → Models.
            </p>
          ) : (
            <>
              <Select
                disabled={pending || !thread}
                onValueChange={(value) => {
                  if (value) handleModelChange(value)
                }}
                value={boundPresetId}
              >
                <SelectTrigger className="w-full font-mono" size="sm">
                  <SelectValue placeholder={label} />
                </SelectTrigger>
                <SelectContent>
                  {selectable.map((provider) => (
                    <SelectGroupedModels
                      key={provider.id}
                      label={provider.label}
                      models={provider.models}
                    />
                  ))}
                </SelectContent>
              </Select>
              {/* The bound model can legitimately be absent from the list:
                  an owner may disable a model a conversation is already
                  running. Saying so beats a select that silently shows a
                  value with no matching option. */}
              {!selectable.some((provider) =>
                provider.models.some((model) => model.id === boundPresetId),
              ) ? (
                <p className="text-muted-foreground">
                  This conversation runs{" "}
                  <span className="font-mono">{boundPresetId}</span>, which is
                  no longer offered for new selections. It keeps running until
                  you choose another.
                </p>
              ) : null}
              <p className="text-muted-foreground">
                Applies from your next message. Changing provider starts a new
                prompt cache for this conversation.
              </p>
            </>
          )}
          {error ? (
            <p className="text-destructive">
              {error instanceof Error
                ? error.message
                : "That change was refused."}
            </p>
          ) : null}
        </div>

        <Separator />

        <div className="flex flex-col gap-1.5">
          <SectionHeader>Tuning</SectionHeader>
          <ModelTuning
            disabled={pending || !thread}
            onChange={handleRequestOptions}
            record={record}
            requestOptions={thread?.requestOptions}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SelectGroupedModels({
  label,
  models,
}: {
  label: string
  models: readonly ModelEndpointRecord[]
}) {
  return (
    <SelectGroup>
      <SelectLabel>{label}</SelectLabel>
      {models.map((model) => (
        <SelectItem key={model.id} value={model.id}>
          <span className="font-mono">{model.model}</span>
        </SelectItem>
      ))}
    </SelectGroup>
  )
}

/**
 * MDL.4's reasoning level and fast mode, for the model that is actually
 * bound.
 *
 * Declared capability still governs which CONTROLS exist (MDL.4 AC2/AC3) —
 * this never invents a control the fixture did not declare. What changed in
 * MDL.5 is the empty case: a model declaring neither now says so, because
 * rendering nothing inside an opened popover reads as a broken surface rather
 * than as an honest absence.
 */
function ModelTuning({
  disabled,
  onChange,
  record,
  requestOptions,
}: {
  disabled: boolean
  onChange: (next: AgentThreadRequestOptions) => void
  record: ModelEndpointRecord | undefined
  requestOptions: AgentThreadRequestOptions | undefined
}) {
  if (!record) {
    return (
      <p className="text-muted-foreground">
        This model is not in the current inventory, so its tunable settings are
        unknown.
      </p>
    )
  }
  if (!record.reasoning && !record.fastMode) {
    return (
      <p className="text-muted-foreground">
        {record.model} declares no reasoning levels or fast mode
        {record.contextWindowTokens > 0
          ? ` — ${formatContextWindow(record.contextWindowTokens)}.`
          : "."}
      </p>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {record.reasoning ? (
        <Select
          disabled={disabled}
          onValueChange={(value) => {
            if (value) onChange({ reasoningLevel: value })
          }}
          value={requestOptions?.reasoningLevel ?? record.reasoning.default}
        >
          <ToneChip
            aria-label="Reasoning level"
            render={<SelectTrigger size="sm" />}
            title="Reasoning level"
          >
            <SelectValue />
          </ToneChip>
          <SelectContent align="start">
            {record.reasoning.levels.map((level) => (
              <SelectItem key={level} value={level}>
                {level}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {record.fastMode ? (
        <ToneChip
          aria-label="Fast mode"
          aria-pressed={requestOptions?.fastMode === true}
          disabled={disabled}
          onClick={() => onChange({ fastMode: !requestOptions?.fastMode })}
          title="Fast mode"
          tone={requestOptions?.fastMode === true ? "info" : "muted"}
        >
          Fast
        </ToneChip>
      ) : null}
    </div>
  )
}
