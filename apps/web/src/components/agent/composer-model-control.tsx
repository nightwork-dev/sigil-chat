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

import { DEPLOYMENT_DEFAULT_PRESET_ID } from "@workspace/runtime-env/constants"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
  selectableModelProviders,
  useModelEndpoints,
  type ModelProviderRecord,
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
  const triggerLabel = record?.label ?? label
  const reasoning = record?.reasoning
  const declaresFastMode = record?.fastMode === true
  const hasTuning = Boolean(reasoning || declaresFastMode)
  const reasoningLevel =
    thread?.requestOptions?.reasoningLevel ?? reasoning?.default
  const fastMode = thread?.requestOptions?.fastMode === true

  // A rebind that lost a revision race is the ordinary concurrent-edit case,
  // not a model problem — but the user still has to be told the model did not
  // change, which is what surfacing the server's own message does.
  const error = setModel.isError ? setModel.error : undefined

  function handleModelChange(presetId: string) {
    if (!thread || presetId === boundPresetId) return
    setModel.mutate({
      id: thread.id,
      ...(presetId === DEPLOYMENT_DEFAULT_PRESET_ID
        ? {}
        : { modelPresetId: presetId }),
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToneChip
            aria-label={`Model: ${label}`}
            className={cn(
              "min-w-0 max-w-48 shrink font-mono max-sm:max-w-28",
              className,
            )}
            title="Model, reasoning level, and fast mode"
            tone={error ? "destructive" : "muted"}
          />
        }
      >
        <span className="truncate">{triggerLabel}</span>
        {reasoningLevel ? (
          <span className="text-muted-foreground">
            {titleCase(reasoningLevel)}
          </span>
        ) : null}
        {fastMode ? <span className="text-muted-foreground">Fast</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56" side="top">
        {hasTuning ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={pending || !thread}>
              <span>Model</span>
              <DropdownMenuShortcut className="max-w-32 truncate">
                {triggerLabel}
              </DropdownMenuShortcut>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(24rem,calc(100vh-2rem))] min-w-64 overflow-y-auto">
              <ModelMenuItems
                boundPresetId={boundPresetId}
                error={endpoints.isError}
                loading={endpoints.isPending || enablement.isPending}
                onChange={handleModelChange}
                providers={selectable}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <ModelMenuItems
            boundPresetId={boundPresetId}
            error={endpoints.isError}
            loading={endpoints.isPending || enablement.isPending}
            onChange={handleModelChange}
            providers={selectable}
          />
        )}
        {reasoning ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={pending || !thread}>
              <span>Effort</span>
              <DropdownMenuShortcut>
                {titleCase(reasoningLevel ?? reasoning.default)}
              </DropdownMenuShortcut>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  handleRequestOptions({ reasoningLevel: value })
                }
                value={reasoningLevel ?? reasoning.default}
              >
                {reasoning.levels.map((level) => (
                  <DropdownMenuRadioItem key={level} value={level}>
                    {titleCase(level)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {declaresFastMode ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={pending || !thread}>
              <span>Speed</span>
              <DropdownMenuShortcut>
                {fastMode ? "Fast" : "Standard"}
              </DropdownMenuShortcut>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                onValueChange={(value) =>
                  handleRequestOptions({ fastMode: value === "fast" })
                }
                value={fastMode ? "fast" : "standard"}
              >
                <DropdownMenuRadioItem value="standard">
                  Standard
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="fast">Fast</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {error ? (
          <DropdownMenuLabel className="max-w-64 text-destructive">
            {error instanceof Error
              ? error.message
              : "That change was refused."}
          </DropdownMenuLabel>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ModelMenuItems({
  boundPresetId,
  error,
  loading,
  onChange,
  providers,
}: {
  boundPresetId: string
  error: boolean
  loading: boolean
  onChange: (presetId: string) => void
  providers: readonly ModelProviderRecord[]
}) {
  if (loading) return <DropdownMenuLabel>Loading models…</DropdownMenuLabel>
  if (error) {
    return (
      <DropdownMenuLabel className="text-destructive">
        Model list unavailable
      </DropdownMenuLabel>
    )
  }
  if (providers.length === 0) {
    return <DropdownMenuLabel>No models enabled in Settings</DropdownMenuLabel>
  }

  return (
    <DropdownMenuRadioGroup onValueChange={onChange} value={boundPresetId}>
      {providers.map((provider) => (
        <div key={provider.id}>
          <DropdownMenuLabel>{provider.label}</DropdownMenuLabel>
          {provider.models.map((model) => (
            <DropdownMenuRadioItem
              className="font-mono"
              key={model.id}
              value={model.id}
            >
              {model.model}
            </DropdownMenuRadioItem>
          ))}
        </div>
      ))}
    </DropdownMenuRadioGroup>
  )
}
