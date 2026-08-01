// Settings → Models: the endpoint management surface (MDL.2 criterion 4).
//
// Two jobs, in the order an operator needs them:
//   1. What can this deployment run, and is each entry actually usable —
//      i.e. is its credential present. Presence only: Eve holds the values,
//      and nothing on this page has ever seen one.
//   2. Try a local OpenAI-compatible endpoint before committing it, then
//      show the fixture rows that make it selectable. Providers are fixture
//      DATA (David, 2026-07-31), so "adding an endpoint" is authoring those
//      rows — this page probes and generates them, it does not secretly
//      write config the runtime would not reload anyway.
//
// Credential state is a sentence, not a color-coded indicator: `destructive`
// is reserved for the one state that is genuinely broken (required and
// absent), so it keeps meaning exactly that everywhere else in the app.

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { CodeBlock } from "@workspace/ui/components/code-block"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { SectionHeader } from "@workspace/ui/components/section-header"

import {
  presetFixtureSnippet,
  suggestPresetId,
  useModelEndpoints,
  useProbeModelEndpoint,
  type ModelEndpointRecord,
} from "@/lib/model-endpoints"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"

const DEPLOYMENT_DEFAULT_PRESET_ID = "deployment-default"

export function ModelsSection({ userId }: { userId: string }) {
  const endpoints = useModelEndpoints()
  const preferred = useUserSetting(userId, "agent.modelPresetId")
  const setPreferred = useSetUserSetting(userId, "agent.modelPresetId")

  // This selection is now live: it is applied by useCreateAgentThread to every
  // new session, resolved server-side against the fixture presets, and written
  // into the thread's immutable `AgentThreadExecutionBinding.model`.
  //
  // Switching model *mid-session* is the slice after that, and this is where
  // its UI would live. Two constraints have to be visible at the moment of
  // choosing rather than charged silently: a provider change invalidates that
  // session's prompt cache and may force a compaction checkpoint (David,
  // 2026-07-31), and the spec's v1 answer is that choosing a different model
  // from an existing conversation FORKS it into a new immutable binding
  // rather than rebinding the live thread. The control is therefore
  // "continue in a new session on <model>", not a silent swap.
  function handlePreferredChange(next: string) {
    setPreferred.mutate({
      scopeKind: "user",
      scopeId: "",
      value: next === DEPLOYMENT_DEFAULT_PRESET_ID ? null : next,
      expectedRevision: preferred.data?.revision ?? undefined,
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-1">
          <SectionHeader>Configured models</SectionHeader>
          <p className="text-xs text-muted-foreground">
            Entries come from <code className="font-mono">agent.presets</code>{" "}
            in the application fixture. Credentials stay in the agent
            runtime&apos;s environment — this page can see whether a variable
            is set, never what it contains.
          </p>
        </div>

        {endpoints.isPending ? (
          <p className="text-xs text-muted-foreground">Loading endpoints…</p>
        ) : endpoints.isError ? (
          <p className="text-xs text-destructive">
            The agent runtime did not answer. Endpoint status is unavailable
            until it does.
          </p>
        ) : (
          <RadioGroup
            aria-label="Preferred model for new sessions"
            value={preferred.data?.value ?? DEPLOYMENT_DEFAULT_PRESET_ID}
            onValueChange={handlePreferredChange}
            className="flex flex-col gap-0 divide-y divide-border"
          >
            {endpoints.data.endpoints.map((endpoint) => (
              <EndpointRow key={endpoint.id} endpoint={endpoint} />
            ))}
          </RadioGroup>
        )}

        <p className="text-xs text-muted-foreground">
          New sessions you start run this model. It is bound when the session is
          created and stays fixed for that conversation, so sessions already
          open keep the model they began with.
        </p>
      </section>

      <AddEndpointSection />
    </div>
  )
}

function EndpointRow({ endpoint }: { endpoint: ModelEndpointRecord }) {
  const inputId = `model-preset-${endpoint.id}`
  return (
    <div className="flex items-start gap-2.5 py-3 first:pt-0 last:pb-0">
      <RadioGroupItem value={endpoint.id} id={inputId} className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label
          htmlFor={inputId}
          className="flex flex-wrap items-baseline gap-x-2 font-normal"
        >
          <span className="text-xs font-medium text-foreground">
            {endpoint.label}
          </span>
          {endpoint.isDeploymentDefault ? (
            <span className="text-xs text-muted-foreground">
              Active — resolved at agent startup
            </span>
          ) : null}
        </Label>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {endpoint.model} · {endpoint.provider} ·{" "}
          {formatContextWindow(endpoint.contextWindowTokens)}
        </p>
        {endpoint.baseUrl ? (
          <p className="truncate font-mono text-xs text-muted-foreground">
            {endpoint.baseUrl}
          </p>
        ) : null}
        <CredentialLine endpoint={endpoint} />
      </div>
    </div>
  )
}

function CredentialLine({ endpoint }: { endpoint: ModelEndpointRecord }) {
  const { credential } = endpoint
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
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1">
        <SectionHeader>Add a local endpoint</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Ollama, LM Studio, vLLM, and llama.cpp all speak the same
          OpenAI-compatible HTTP API. Probe one to confirm the agent runtime
          can reach it and to see what it serves, then add the generated rows
          to the application fixture.
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
                Add these rows under{" "}
                <code className="font-mono">agent.presets</code> in{" "}
                <code className="font-mono">
                  fixtures/application/sigil-chat.yaml
                </code>
                , then restart the agent runtime.
              </p>
              <CodeBlock
                language="yaml"
                code={presetFixtureSnippet({
                  id: suggestPresetId(baseUrl.trim(), model),
                  label: model,
                  model,
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
    </section>
  )
}

function formatContextWindow(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "context window unknown"
  return tokens >= 1_000
    ? `${Math.round(tokens / 1_000)}K context`
    : `${tokens} context`
}
