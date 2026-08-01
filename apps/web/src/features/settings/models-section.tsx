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
  providerFixtureSnippet,
  suggestProviderId,
  useModelEndpoints,
  useProbeModelEndpoint,
  type ModelCatalogStatus,
  type ModelEndpointCredentialStatus,
  type ModelEndpointRecord,
  type ModelProviderRecord,
} from "@/lib/model-endpoints"
import {
  isModelEnabledForNewSessions,
  isModelEnablementLocked,
  useEnabledModelIds,
  useSetModelEnabled,
} from "@/lib/model-enablement"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"
import {
  SettingsAsyncState,
  SettingsNote,
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
              <SettingsNote tone="error">
                New chats are set to{" "}
                <span className="font-mono">{preferredId}</span>, which is no
                longer available. Choose another to start chats again.
              </SettingsNote>
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
              <SettingsNote tone="error">
                {setEnabled.error instanceof Error
                  ? setEnabled.error.message
                  : "That change was refused."}
              </SettingsNote>
            ) : null}
            <SettingsNote>
              Providers come from{" "}
              <code className="font-mono">agent.providers</code> in the
              application fixture; a model becomes available to new chats only
              when you turn it on here, and stays unavailable until you do.
              Credentials stay in the agent runtime&apos;s environment — this
              page can see whether a variable is set, never what it contains.
            </SettingsNote>
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
  // Only what a new chat can actually be created on. Offering an unavailable
  // model would produce a control that appears to work and a chat that refuses
  // to start — the server applies the same rule regardless of what is listed.
  const selectable = providers
    .map((provider) => ({
      ...provider,
      models: provider.models.filter((model) =>
        isModelEnabledForNewSessions(model, enabledIds),
      ),
    }))
    .filter((provider) => provider.models.length > 0)

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
      <p className="text-xs text-muted-foreground">
        Bound when a chat is created and fixed for that conversation, so chats
        already open keep the model they began with.
      </p>
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
  const availableCount = provider.models.filter((model) =>
    isModelEnabledForNewSessions(model, enabledIds),
  ).length

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-foreground">
              {provider.label}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {provider.kind}
            </span>
          </div>
          {provider.baseUrl ? (
            <p className="truncate font-mono text-xs text-muted-foreground">
              {provider.baseUrl}
            </p>
          ) : null}
          <CredentialLine credential={provider.credential} />
          <CatalogLine catalog={provider.catalog} />
          <p className="text-xs text-muted-foreground">
            {availableCount} of {provider.models.length} available to new chats
          </p>
        </div>
        <Switch
          size="sm"
          className="mt-0.5 shrink-0"
          aria-label={`Make every ${provider.label} model available to new chats`}
          checked={toggleable.length === 0 ? availableCount > 0 : allOn}
          disabled={pending || toggleable.length === 0}
          onCheckedChange={(next) =>
            onChange(
              toggleable.map((model) => model.id),
              next,
            )
          }
        />
      </div>

      {/* Model rows. Fetched catalog models append here, disabled like any
          other until an owner turns them on. */}
      <div className="flex flex-col gap-1 border-l border-border pl-3">
        {provider.models.map((model: ModelEndpointRecord) => (
          <ModelRow
            key={model.id}
            model={model}
            enabledIds={enabledIds}
            pending={pending}
            onChange={(enabled) => onChange([model.id], enabled)}
          />
        ))}
      </div>
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
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs text-foreground">
            {model.model}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatContextWindow(model.contextWindowTokens)}
          </span>
          {model.discovered ? (
            <span
              className="rounded-sm border border-border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              title="Not in the application fixture — found by a live catalog check of this provider."
            >
              Discovered
            </span>
          ) : null}
        </div>
        {locked ? (
          <p className="text-xs text-muted-foreground">
            {model.isDeploymentDefault
              ? // Post-binding this means something narrower than it used to:
                // sessions carry their own model, so the fixture default is
                // what a session falls back to when it has none — which is why
                // it cannot be switched off from here.
                "Always available: chats with no model of their own run this one."
              : "Turned off in the application fixture."}
          </p>
        ) : model.discovered ? (
          <p className="text-xs text-muted-foreground">
            Not yet in the application fixture — turning this on is enough to
            use it, but it will offer again after every restart until it is
            authored there too.
          </p>
        ) : null}
      </div>
      <Switch
        size="sm"
        className="mt-0.5 shrink-0"
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
    return (
      <p className="text-xs text-muted-foreground">No credential required.</p>
    )
  }
  if (!credential.envName) {
    // Codex reads the local `codex login` session rather than a variable, so
    // there is no name to print — only whether that login is usable.
    return credential.present ? (
      <p className="text-xs text-muted-foreground">Signed in locally.</p>
    ) : (
      <p className="text-xs text-destructive">
        No local sign-in. Run <code className="font-mono">codex login</code>{" "}
        where the agent runs.
      </p>
    )
  }
  return credential.present ? (
    <p className="text-xs text-muted-foreground">
      <span className="font-mono">{credential.envName}</span> is set.
    </p>
  ) : (
    <p className="text-xs text-destructive">
      <span className="font-mono">{credential.envName}</span> is not set.
    </p>
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
      <p className="text-xs text-destructive">
        Catalog check failed: {catalog.error}
      </p>
    )
  }
  return (
    <p className="text-xs text-muted-foreground">
      Catalog checked {formatRelativeTime(catalog.checkedAt)}.
    </p>
  )
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "recently"
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (seconds < 5) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
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
    <SettingsSection>
      <div className="flex flex-col gap-1">
        <SectionHeader>Add a provider</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Ollama, LM Studio, vLLM, and llama.cpp all speak the same
          OpenAI-compatible HTTP API. Probe one to confirm the agent runtime can
          reach it and to see what it serves, then add the generated rows to the
          application fixture.
        </p>
      </div>

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
            Credential variable for the generated rows (optional)
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
      <p className="text-xs text-muted-foreground">
        Name the environment variable the agent runtime reads the key from, not
        the key. Local servers usually need none. The probe itself runs
        unauthenticated against a new address — a credential is only ever sent
        to an origin already listed in the fixture.
      </p>

      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canProbe}
          onClick={handleProbe}
        >
          {probe.isPending ? "Probing…" : "Probe endpoint"}
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
              Reachable — serving {result.models.length}{" "}
              {result.models.length === 1 ? "model" : "models"}.
            </p>
          ) : (
            <p className="text-xs text-destructive">
              Unreachable.{result.error ? ` ${result.error}` : ""}
            </p>
          )}

          {result.credential.envName ? (
            <p className="text-xs text-muted-foreground">
              This origin is already configured, so the probe used{" "}
              <span className="font-mono">{result.credential.envName}</span>,
              which {result.credential.present ? "is set" : "is not set"}.
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
              <p className="text-xs text-muted-foreground">
                Add this provider under{" "}
                <code className="font-mono">agent.providers</code> in{" "}
                <code className="font-mono">
                  fixtures/application/sigil-chat.yaml
                </code>
                , then restart the agent runtime.
              </p>
              <CodeBlock
                language="yaml"
                code={providerFixtureSnippet({
                  id: suggestProviderId(baseUrl.trim(), model),
                  label: model,
                  model,
                  modelId: "default",
                  baseUrl: baseUrl.trim(),
                  ...(apiKeyEnv.trim() ? { apiKeyEnv: apiKeyEnv.trim() } : {}),
                })}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsSection>
  )
}

function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "context window unknown"
  return tokens >= 1_000
    ? `${Math.round(tokens / 1_000)}K context`
    : `${tokens} context`
}
