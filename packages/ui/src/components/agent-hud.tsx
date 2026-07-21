import { useState, type FormEvent, type ReactNode } from "react";

import {
  attentionSelectionKey,
  createAttentionContextPreview,
  removeTurnContextAttachment,
  setAttentionItemExcluded,
  useAttentionExclusions,
  useTurnContextAttachments,
} from "@zigil/agent-react/context-draft";
import {
  setAttentionPrivacyLevel,
  useAttentionPrivacyLevel,
  type AttentionPrivacyLevel,
} from "@zigil/agent-react/context-privacy";
import { useAgentRuntimeSession } from "@zigil/agent-react/session";
import { useAttention } from "@zigil/agent-react/attention";
import {
  isAgentSessionBusy,
  type AgentApprovalPresentation,
  type AgentForkIntent,
  type AgentRuntimeSession,
  type AgentThreadControls,
} from "@zigil/agent-surface/contracts";
import { MessageParts } from "@workspace/ui/components/part-projection";
import { Button } from "@workspace/ui/components/button";
import {
  FloatingDock,
  type FloatingDockExpandProps,
  type FloatingDockPanelProps,
  type FloatingDockRootProps,
  type FloatingDockTriggerProps,
} from "@workspace/ui/components/floating-dock";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Textarea } from "@workspace/ui/components/textarea";
import {
  getAgentHudApprovalActions,
  getAgentHudStatusLabel,
  getAgentHudTriggerLabel,
  getAgentHudTriggerState,
  shouldClearAgentComposer,
} from "@workspace/ui/lib/agent-hud-state";

type AgentHudRootProps = FloatingDockRootProps;

function Root(props: AgentHudRootProps) {
  return <FloatingDock.Root {...props} />;
}

interface AgentHudTriggerProps extends Omit<
  FloatingDockTriggerProps,
  "children"
> {
  children?: ReactNode;
}

function Trigger({ children, ...props }: AgentHudTriggerProps) {
  const session = useAgentRuntimeSession();
  const state = getAgentHudTriggerState(session);
  const content = children ?? getAgentHudTriggerLabel(session);

  return (
    <FloatingDock.Trigger
      aria-label={typeof content === "string" ? content : "Open agent"}
      data-agent-state={state}
      {...props}
    >
      {content}
    </FloatingDock.Trigger>
  );
}

interface AgentHudPanelProps extends Omit<
  FloatingDockPanelProps,
  "actions" | "description" | "heading"
> {
  actions?: ReactNode;
  approvals?: readonly AgentApprovalPresentation[];
  forkIntent?: AgentForkIntent;
  navigationTarget?: FloatingDockExpandProps["render"];
  placeholder?: string;
  threadControls?: AgentThreadControls;
}

function Panel({
  actions,
  approvals = [],
  children,
  forkIntent,
  navigationTarget,
  placeholder,
  threadControls,
  ...props
}: AgentHudPanelProps) {
  const session = useAgentRuntimeSession();
  const panelActions = (
    <>
      <AgentStatus status={session.status} />
      {actions}
      <FloatingDock.Expand render={navigationTarget} />
    </>
  );

  return (
    <FloatingDock.Panel
      actions={panelActions}
      aria-label="Agent"
      heading=""
      {...props}
    >
      {children ?? (
        <AgentHudConversation
          approvals={approvals}
          forkIntent={forkIntent}
          placeholder={placeholder}
          session={session}
          threadControls={threadControls}
        />
      )}
    </FloatingDock.Panel>
  );
}

export function AgentStatus({
  status,
}: {
  readonly status: AgentRuntimeSession["status"];
}) {
  const label = getAgentHudStatusLabel(status);
  return (
    <span aria-label={`Agent ${label}`} data-agent-status={status}>
      {label}
    </span>
  );
}

/**
 * A small transcript/composer for HUD embedding. Hosts can replace it through
 * `AgentHud.Panel` children; full chat surfaces stay app-owned.
 */
export function AgentHudConversation({
  approvals = [],
  forkIntent,
  placeholder = "Ask the agent...",
  session,
  threadControls,
}: {
  readonly approvals?: readonly AgentApprovalPresentation[];
  readonly forkIntent?: AgentForkIntent;
  readonly placeholder?: string;
  readonly session: AgentRuntimeSession;
  readonly threadControls?: AgentThreadControls;
}) {
  const [input, setInput] = useState("");
  const busy = isAgentSessionBusy(session);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;
    const result = await session.send({ message });
    if (shouldClearAgentComposer(result)) setInput("");
  };

  return (
    <div data-agent-chat="true">
      {threadControls ? (
        <div aria-label="Agent thread controls">
          <Select
            disabled={busy}
            onValueChange={(value) => {
              if (value) void threadControls.selectThread(value);
            }}
            value={threadControls.activeThreadId}
          >
            <SelectTrigger aria-label="Active agent session" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {threadControls.threads.map((thread) => (
                <SelectItem key={thread.id} value={thread.id}>
                  {thread.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={busy}
            onClick={() => void threadControls.forkActiveThread(forkIntent)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Fork session
          </Button>
          <Button
            disabled={busy}
            onClick={() => void threadControls.createThread()}
            size="sm"
            type="button"
            variant="ghost"
          >
            New session
          </Button>
        </div>
      ) : null}
      <AgentContextInline />
      {approvals.length > 0 ? (
        <div aria-label="Agent approvals">
          {approvals.map((approval) => (
            <article key={approval.part.id}>
              <p>{approval.part.name}</p>
              <div>
                {getAgentHudApprovalActions(approval).map((label) => (
                  <Button
                    key={label}
                    onClick={() => {
                      if (label === "Allow once") void approval.allowOnce();
                      else if (label === "Always allow")
                        void approval.alwaysAllow?.();
                      else void approval.deny();
                    }}
                    size="sm"
                    type="button"
                    variant={label === "Deny" ? "ghost" : "default"}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {session.error ? <p role="alert">{session.error.message}</p> : null}
      <div aria-label="Agent conversation">
        {session.data.messages.map((message) => (
          <article data-role={message.role} key={message.id}>
            <MessageParts parts={message.parts} />
          </article>
        ))}
      </div>
      <form onSubmit={(event) => void submit(event)}>
        <Textarea
          aria-label="Agent message"
          disabled={busy}
          onChange={(event) => setInput(event.currentTarget.value)}
          placeholder={placeholder}
          value={input}
        />
        {busy && session.capabilities.stop && session.stop ? (
          <Button
            onClick={session.stop}
            size="sm"
            type="button"
            variant="ghost"
          >
            Stop
          </Button>
        ) : (
          <Button disabled={!input.trim()} size="sm" type="submit">
            Send
          </Button>
        )}
      </form>
    </div>
  );
}

const privacyLevels: readonly {
  label: string;
  value: AttentionPrivacyLevel;
}[] = [
  { label: "Minimal", value: "minimal" },
  { label: "Focused", value: "focused" },
  { label: "Expanded", value: "expanded" },
];

function AgentContextInline() {
  const attention = useAttention();
  const privacy = useAttentionPrivacyLevel();
  const exclusions = useAttentionExclusions();
  const attachments = useTurnContextAttachments();
  if (!attention && attachments.length === 0) return null;

  const preview = createAttentionContextPreview(
    attention,
    privacy,
    exclusions,
    attachments,
  );
  const selectionCandidates = attention
    ? [
        ...(attention.selection ? [attention.selection] : []),
        ...(attention.selections ?? []),
      ].filter(
        (selection, index, candidates) =>
          candidates.findIndex(
            (candidate) =>
              attentionSelectionKey(candidate) ===
              attentionSelectionKey(selection),
          ) === index,
      )
    : [];
  const excludedSelections = selectionCandidates.filter((selection) =>
    exclusions.includes(attentionSelectionKey(selection)),
  );

  return (
    <details className="border-b border-border px-3 py-2" data-agent-context>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Context - {preview.summary} - ~{preview.estimatedTokens} tokens
      </summary>
      <div className="mt-3 grid gap-3">
        <div
          aria-label="Agent context privacy"
          className="flex flex-wrap gap-1"
        >
          {privacyLevels.map((level) => (
            <Button
              aria-pressed={privacy === level.value}
              key={level.value}
              onClick={() => setAttentionPrivacyLevel(level.value)}
              size="sm"
              type="button"
              variant={privacy === level.value ? "secondary" : "ghost"}
            >
              {level.label}
            </Button>
          ))}
        </div>
        {preview.selections.length > 0 ? (
          <ul aria-label="Shared agent selections" className="grid gap-1">
            {preview.selections.map((selection) => (
              <li
                className="flex min-w-0 items-center justify-between gap-2 text-xs"
                key={attentionSelectionKey(selection)}
              >
                <span className="truncate">
                  {selection.label ?? selection.id}
                </span>
                <Button
                  aria-label={`Exclude ${selection.label ?? selection.id} from this turn`}
                  onClick={() =>
                    setAttentionItemExcluded(
                      attentionSelectionKey(selection),
                      true,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Exclude
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {excludedSelections.length > 0 ? (
          <ul aria-label="Excluded agent selections" className="grid gap-1">
            {excludedSelections.map((selection) => (
              <li
                className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground"
                key={attentionSelectionKey(selection)}
              >
                <span className="truncate">
                  {selection.label ?? selection.id} - excluded
                </span>
                <Button
                  aria-label={`Include ${selection.label ?? selection.id} in this turn`}
                  onClick={() =>
                    setAttentionItemExcluded(
                      attentionSelectionKey(selection),
                      false,
                    )
                  }
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Include
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {preview.attachments.length > 0 ? (
          <ul aria-label="Agent context attachments" className="grid gap-1">
            {preview.attachments.map((attachment) => (
              <li
                className="flex min-w-0 items-center justify-between gap-2 text-xs"
                key={attachment.id}
              >
                <span className="truncate">
                  {attachment.label} - {attachment.retention}
                </span>
                <Button
                  aria-label={`Remove ${attachment.label} from this turn`}
                  onClick={() => removeTurnContextAttachment(attachment.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted p-3 font-mono text-[11px] text-muted-foreground">
          {preview.formatted}
        </pre>
      </div>
    </details>
  );
}

export const AgentHud = { Root, Trigger, Panel };
export type { AgentHudPanelProps, AgentHudRootProps, AgentHudTriggerProps };
