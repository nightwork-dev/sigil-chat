// Settings → Models: the endpoint management surface (MDL.2 criterion 4).
//
// Organised by PROVIDER, not by model (David, 2026-07-31): a provider entry
// carries the facts that belong to the endpoint — kind, address, credential —
// once, and its models are rows inside it. Authoring a row per model made the
// provider invisible and repeated "(Codex subscription)" on every line.
//
// Inventory and selection are separate controls because they mean different
// things. The list answers "what can this deployment run, and is it usable";
// the single select answers "what do MY new chats use". Merging them into one
// radio list made a row's selected state ambiguous — it read as both "this is
// configured" and "this is chosen".
//
// Shape is deliberately forward-compatible: fetched catalog models append to a
// provider's `models` array. A discovered model arrives disabled like every
// other, so the allow-list already covers it.
//
// The availability switches answer ONE question — may a NEW chat be started on
// this? — at two grains: a model row, and the provider that bills for it. They
// are not a health, credential, or reachability indicator; those are the text
// lines above them, which say different things and are never recolored to
// agree with a switch.

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { CodeBlock } from "@workspace/ui/components/code-block"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { FieldError } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Switch } from "@workspace/ui/components/switch"
import { DEPLOYMENT_DEFAULT_PRESET_ID } from "@workspace/runtime-env/constants"

import {
  formatContextWindow,
  formatRelativeTime,
  providerFixtureSnippet,
  selectableModelProviders,
  suggestProviderId,
  useModelEndpoints,
  useProbeModelEndpoint,
  type ModelCatalogStatus,
  type ModelEndpointCredentialStatus,
  type ModelEndpointRecord,
  type ModelProviderRecord,
} from "@/lib/model-endpoints"
import {
  MAX_MODEL_ENABLEMENT_IDS_PER_REQUEST,
  isModelEnabledForNewSessions,
  isModelEnablementLocked,
  useEnabledModelIds,
  useSetModelEnabled,
} from "@/lib/model-enablement"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"
import {
  SettingsAsyncState,
  SettingsPanel,
  SettingsSection,
} from "@/features/settings/settings-panel"

export function ModelsSection({ userId }: { userId: string }) {
  const endpoints = useModelEndpoints()
  const enablement = useEnabledModelIds()
  const setEnabled = useSetModelEnabled()
  const preferred = useUserSetting(userId, "agent.modelPresetId")
  const setPreferred = useSetUserSetting(userId, "agent.modelPresetId")
  const providers = endpoints.data?.providers ?? []
  const enabledIds = enablement.data?.enabledIds ?? []

  // Switching model *mid-session* is the slice after this one, and this is
  // where its UI would live. Two constraints have to be visible at the moment
  // of choosing rather than charged silently: a provider change invalidates
  // that session's prompt cache and may force a compaction checkpoint (David,
  // 2026-07-31), and the spec's v1 answer is that choosing a different model
  // from an existing conversation FORKS it into a new immutable binding rather
  // than rebinding the live thread. The control is therefore "continue in a new
  // session on <model>", not a silent swap.
  function handlePreferredChange(next: string) {
    setPreferred.mutate({
      scopeKind: "user",
      scopeId: "",
      value: next === DEPLOYMENT_DEFAULT_PRESET_ID ? null : next,
      expectedRevision: preferred.data?.revision ?? undefined,
    })
  }

  const preferredId = preferred.data?.value ?? DEPLOYMENT_DEFAULT_PRESET_ID

  /**
   * Turning a model off, and releasing anyone still pointed at it.
   *
   * The create path REFUSES an unavailable model rather than quietly
   * substituting one — that refusal is the whole rule. So an owner who
   * switches off the model their own new chats are set to would break their
   * own next chat. Releasing the preference in the same interaction is the
   * honest fix: it happens because the owner acted, at the moment they acted,
   * not silently at creation time.
   */
  function handleEnablementChange(presetIds: string[], enabled: boolean) {
    if (!enabled && presetIds.includes(preferredId)) {
      handlePreferredChange(DEPLOYMENT_DEFAULT_PRESET_ID)
    }
    setEnabled.mutate({ presetIds, enabled })
  }

  return (
    <SettingsPanel>
      <SettingsSection>
        <SectionHeader>Models</SectionHeader>

        <SettingsAsyncState
          query={endpoints}
          pending="Loading providers…"
          error="The agent runtime did not answer. Provider status is unavailable until it does."
        >
          <>
            <NewChatModelPicker
              providers={providers}
              enabledIds={enabledIds}
              value={preferredId}
              disabled={setPreferred.isPending}
              onChange={handlePreferredChange}
            />
            {/* Catches what the reset-on-disable path above cannot: a model
                retired in the fixture while it was still someone's choice.
                New chats are refused until a different one is picked, so the
                page has to say so rather than render an empty control. */}
            {providers.length > 0 &&
            !providers.some((provider) =>
              provider.models.some(
                (model) =>
                  model.id === preferredId &&
                  isModelEnabledForNewSessions(model, enabledIds),
              ),
            ) ? (
              <FieldError>
                New chats are set to{" "}
                <span className="font-mono">{preferredId}</span>, which is no
                longer available. Choose another to start chats again.
              </FieldError>
            ) : null}
            <div className="divide-y divide-border">
              {providers.map((provider: ModelProviderRecord) => (
                <ProviderBlock
                  key={provider.id}
                  provider={provider}
                  enabledIds={enabledIds}
                  pending={setEnabled.isPending || enablement.isPending}
                  onChange={handleEnablementChange}
                />
              ))}
            </div>
            {setEnabled.isError ? (
              <FieldError>
                {setEnabled.error instanceof Error
                  ? setEnabled.error.message
                  : "That change was refused."}
              </FieldError>
            ) : null}
          </>
        </SettingsAsyncState>
      </SettingsSection>

      <AddEndpointSection />
    </SettingsPanel>
  )
}

/**
 * One control, one meaning: which model this account's new chats are bound to.
 * Options are grouped by provider so the same structure reads the same way in
 * both places on the page.
 */
function NewChatModelPicker({
  providers,
  enabledIds,
  value,
  disabled,
  onChange,
}: {
  providers: readonly ModelProviderRecord[]
  enabledIds: readonly string[]
  value: string
  disabled: boolean
  onChange: (next: string) => void
}) {
  // Only what a new chat can actually be created on — the same narrowing the
  // composer's model control applies, from the same function.
  const selectable = selectableModelProviders(providers, enabledIds)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="new-chat-model" className="text-xs">
          New chats use
        </Label>
        <Select
          value={value}
          onValueChange={(next) => {
            // base-ui's Select can clear to null; there is no "no model" state
            // here, so a clear is simply not a change.
            if (next !== null) onChange(next)
          }}
          disabled={disabled}
        >
          <SelectTrigger id="new-chat-model" size="sm" className="w-64">
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            {selectable.map((provider: ModelProviderRecord) => (
              <SelectGroup key={provider.id}>
                <SelectLabel>{provider.label}</SelectLabel>
                {provider.models.map((model: ModelEndpointRecord) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.model}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function ProviderBlock({
  provider,
  enabledIds,
  pending,
  onChange,
}: {
  provider: ModelProviderRecord
  enabledIds: readonly string[]
  pending: boolean
  onChange: (presetIds: string[], enabled: boolean) => void
}) {
  // What an owner may actually turn on here: a model the fixture disabled is
  // the author's call, and the deployment default is permanently available.
  const toggleable = provider.models.filter(
    (model) => model.enabled && !isModelEnablementLocked(model),
  )
  const allOn =
    toggleable.length > 0 &&
    toggleable.every((model) => enabledIds.includes(model.id))
  const canBulkToggle =
    toggleable.length > 0 &&
    toggleable.length <= MAX_MODEL_ENABLEMENT_IDS_PER_REQUEST
  const availableCount = provider.models.filter((model) =>
    isModelEnabledForNewSessions(model, enabledIds),
  ).length

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-xs font-medium text-foreground">
              {provider.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {provider.kind}
            </span>
            <span className="text-xs text-muted-foreground">
              {availableCount}/{provider.models.length} enabled
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {provider.baseUrl ? (
              <span
                className="max-w-full truncate font-mono"
                title={provider.baseUrl}
              >
                {provider.baseUrl}
              </span>
            ) : null}
            <CredentialLine credential={provider.credential} />
            {provider.credential.required &&
            !provider.credential.present ? null : (
              <CatalogLine catalog={provider.catalog} />
            )}
          </div>
        </div>
        {canBulkToggle ? (
          <Switch
            size="sm"
            className="mt-0.5 shrink-0"
            aria-label={`Make every ${provider.label} model available to new chats`}
            checked={allOn}
            disabled={pending}
            onCheckedChange={(next) =>
              onChange(
                toggleable.map((model) => model.id),
                next,
              )
            }
          />
        ) : null}
      </div>

      <ProviderModels
        provider={provider}
        enabledIds={enabledIds}
        pending={pending}
        onChange={onChange}
      />
    </div>
  )
}

function ProviderModels({
  provider,
  enabledIds,
  pending,
  onChange,
}: {
  provider: ModelProviderRecord
  enabledIds: readonly string[]
  pending: boolean
  onChange: (presetIds: string[], enabled: boolean) => void
}) {
  const authored = provider.models.filter((model) => !model.discovered)
  const discovered = provider.models.filter((model) => model.discovered)
  const enabledDiscovered = discovered.filter((model) =>
    isModelEnabledForNewSessions(model, enabledIds),
  )
  const otherDiscovered = discovered.filter(
    (model) => !isModelEnabledForNewSessions(model, enabledIds),
  )

  return (
    <div className="flex flex-col gap-1 border-l border-border pl-3">
      {[...authored, ...enabledDiscovered].map((model: ModelEndpointRecord) => (
        <ModelRow
          key={model.id}
          model={model}
          enabledIds={enabledIds}
          pending={pending}
          onChange={(enabled) => onChange([model.id], enabled)}
        />
      ))}
      {otherDiscovered.length > 0 ? (
        <DiscoveredModelSearch
          models={otherDiscovered}
          enabledIds={enabledIds}
          pending={pending}
          onChange={onChange}
        />
      ) : null}
    </div>
  )
}

const MAX_DISCOVERED_MODEL_RESULTS = 12

function DiscoveredModelSearch({
  models,
  enabledIds,
  pending,
  onChange,
}: {
  models: readonly ModelEndpointRecord[]
  enabledIds: readonly string[]
  pending: boolean
  onChange: (presetIds: string[], enabled: boolean) => void
}) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filtered =
    normalizedQuery.length === 0
      ? []
      : models.filter((model) =>
          `${model.label} ${model.model}`
            .toLowerCase()
            .includes(normalizedQuery),
        )
  const visible = filtered.slice(0, MAX_DISCOVERED_MODEL_RESULTS)

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Find among ${models.length} discovered models`}
        aria-label="Find a discovered model to enable"
        className="h-8 font-mono text-xs"
        autoComplete="off"
        spellCheck={false}
      />
      {normalizedQuery ? (
        <div className="flex flex-col gap-1">
          {visible.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              enabledIds={enabledIds}
              pending={pending}
              onChange={(enabled) => onChange([model.id], enabled)}
            />
          ))}
          {filtered.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              No models match.
            </p>
          ) : null}
          {filtered.length > visible.length ? (
            <p className="py-1 text-xs text-muted-foreground">
              {filtered.length - visible.length} more matches — keep typing to
              narrow the list.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ModelRow({
  model,
  enabledIds,
  pending,
  onChange,
}: {
  model: ModelEndpointRecord
  enabledIds: readonly string[]
  pending: boolean
  onChange: (enabled: boolean) => void
}) {
  const locked = isModelEnablementLocked(model) || !model.enabled

  return (
    <div className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <span
          className="truncate font-mono text-xs text-foreground"
          title={model.model}
        >
          {model.model}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatContextWindow(model.contextWindowTokens)}
        </span>
        {model.isDeploymentDefault ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            Fallback
          </span>
        ) : !model.enabled ? (
          <span className="shrink-0 text-xs text-muted-foreground">
            Fixture-disabled
          </span>
        ) : null}
      </div>
      <Switch
        size="sm"
        className="shrink-0"
        aria-label={`Make ${model.model} available to new chats`}
        checked={isModelEnabledForNewSessions(model, enabledIds)}
        disabled={pending || locked}
        onCheckedChange={onChange}
      />
    </div>
  )
}

function CredentialLine({
  credential,
}: {
  credential: ModelEndpointCredentialStatus
}) {
  if (!credential.required && !credential.envName) {
    return <span className="text-muted-foreground">No credential required</span>
  }
  if (!credential.envName) {
    // Codex reads the local `codex login` session rather than a variable, so
    // there is no name to print — only whether that login is usable.
    return credential.present ? (
      <span className="text-muted-foreground">Signed in locally</span>
    ) : (
      <span className="text-destructive">
        No local sign-in. Run <code className="font-mono">codex login</code>{" "}
        where the agent runs.
      </span>
    )
  }
  return credential.present ? (
    <span className="text-muted-foreground">
      <span className="font-mono">{credential.envName}</span> set
    </span>
  ) : (
    <span className="text-destructive">
      <span className="font-mono">{credential.envName}</span> not set
    </span>
  )
}

/**
 * Whether Eve's live catalog check found anything new — and whether it even
 * ran at all. Absent `catalog` (no field on the provider) means discovery was
 * never attempted for this provider (no baseUrl, or a kind it does not
 * support) and renders nothing; a failed attempt renders honestly rather than
 * looking identical to "nothing new to report".
 */
function CatalogLine({ catalog }: { catalog?: ModelCatalogStatus }) {
  if (!catalog) return null
  if (catalog.error) {
    return (
      <span className="text-destructive">
        Catalog check failed: {catalog.error}
      </span>
    )
  }
  return (
    <span className="text-muted-foreground">
      Checked {formatRelativeTime(catalog.checkedAt)}
    </span>
  )
}

function AddEndpointSection() {
  const probe = useProbeModelEndpoint()
  const [baseUrl, setBaseUrl] = useState("")
  const [model, setModel] = useState("")
  const [apiKeyEnv, setApiKeyEnv] = useState("")

  const result = probe.data
  const canProbe = baseUrl.trim().length > 0 && !probe.isPending

  // A probe request carries the URL and nothing else. The credential field
  // below feeds the generated fixture rows only — which key (if any) Eve
  // attaches is decided from the fixture by origin, so this form cannot aim
  // an existing credential at a new host.
  function handleProbe() {
    probe.mutate({ baseUrl: baseUrl.trim() })
  }

  return (
    <div>
      <Dialog>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          Add provider
        </DialogTrigger>
        <DialogContent className="max-h-[min(90vh,48rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add provider</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="endpoint-base-url" className="text-xs">
                Base URL
              </Label>
              <Input
                id="endpoint-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://127.0.0.1:1234/v1"
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="endpoint-api-key-env" className="text-xs">
                Credential environment (optional)
              </Label>
              <Input
                id="endpoint-api-key-env"
                value={apiKeyEnv}
                onChange={(event) => setApiKeyEnv(event.target.value)}
                placeholder="SIGIL_MODEL_LOCAL_API_KEY"
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div>
            <Button
              type="button"
              size="sm"
              disabled={!canProbe}
              onClick={handleProbe}
            >
              {probe.isPending ? "Probing…" : "Probe"}
            </Button>
          </div>

          {probe.isError ? (
            <p className="text-xs text-destructive">
              {probe.error instanceof Error
                ? probe.error.message
                : "The probe could not be run."}
            </p>
          ) : null}

          {result ? (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {result.reachable ? (
                <p className="text-xs text-muted-foreground">
                  Reachable · {result.models.length}{" "}
                  {result.models.length === 1 ? "model" : "models"}
                </p>
              ) : (
                <p className="text-xs text-destructive">
                  Unreachable{result.error ? ` · ${result.error}` : ""}
                </p>
              )}

              {result.credential.envName ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{result.credential.envName}</span>
                  {result.credential.present ? " set" : " not set"}
                </p>
              ) : null}

              {result.models.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.models.map((servedModel) => (
                    <Button
                      key={servedModel}
                      type="button"
                      size="sm"
                      variant={servedModel === model ? "secondary" : "ghost"}
                      className="h-auto py-1 font-mono text-xs"
                      onClick={() => setModel(servedModel)}
                    >
                      {servedModel}
                    </Button>
                  ))}
                </div>
              ) : null}

              {result.reachable && model ? (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Fixture entry</Label>
                  <CodeBlock
                    language="yaml"
                    code={providerFixtureSnippet({
                      id: suggestProviderId(baseUrl.trim(), model),
                      label: model,
                      model,
                      modelId: "default",
                      baseUrl: baseUrl.trim(),
                      ...(apiKeyEnv.trim()
                        ? { apiKeyEnv: apiKeyEnv.trim() }
                        : {}),
                    })}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
