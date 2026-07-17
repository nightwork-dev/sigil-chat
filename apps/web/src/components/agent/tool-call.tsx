import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  GitForkIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"

import type { AgentToolCallPart, AgentToolInputResponse } from "@zigil/agent-surface"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { cn } from "@workspace/ui/lib/utils"

import { JsonValue } from "@/components/agent/json-value"

export function ToolCall({
  canRespond,
  onAlwaysAllow,
  onInputResponses,
  part,
}: {
  canRespond: boolean
  onAlwaysAllow?: () => void
  onInputResponses: (
    responses: readonly AgentToolInputResponse[],
  ) => void | Promise<void>
  part: AgentToolCallPart
}) {
  const inputRequest = part.inputRequest
  const inputResponse = part.inputResponse
  const actionKind = part.kind ?? "tool-call"
  const actionName = part.name
  const isPending = part.state === "approval-requested"
  const isError =
    part.state === "output-error" || part.state === "output-denied"
  const [isOpen, setIsOpen] = useState(isPending || isError)
  const options = inputRequest?.options
  const dangerOptions = options?.filter((option) => option.style === "danger")
  const isBinaryApproval =
    isPending && options?.length === 2 && dangerOptions?.length === 1
  const approveOption = isBinaryApproval
    ? options?.find((option) => option.style !== "danger")
    : undefined
  const denyOption = isBinaryApproval
    ? options?.find((option) => option.style === "danger")
    : undefined
  const respond = (optionId: string) => {
    if (!inputRequest) return
    void onInputResponses([{ optionId, requestId: inputRequest.requestId }])
  }

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen || isPending || isError}>
      <Card className="gap-0 py-0" size="sm">
        <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left max-sm:min-h-11">
          <ActionIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            kind={actionKind}
          />
          <span className="min-w-0 flex-1 truncate text-xs">
            <span className="text-muted-foreground">
              {actionLabel(actionKind)}
            </span>{" "}
            <span className="font-mono text-[11px]">{actionName}</span>
          </span>
          <ToolState state={part.state} />
          <ChevronDownIcon className="size-3 text-muted-foreground transition-transform [[data-panel-open]_&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 border-t border-border px-3 py-3">
          <JsonValue label="input" value={part.input} />
          {inputRequest ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {inputRequest.prompt}
              </p>
              {inputResponse ? (
                <p className="font-mono text-[10px] text-muted-foreground">
                  Response: {inputResponse.optionId ?? inputResponse.text}
                </p>
              ) : approveOption ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="max-sm:min-h-11"
                    disabled={!canRespond}
                    onClick={() => respond(approveOption.id)}
                    size="sm"
                  >
                    Allow once
                  </Button>
                  {onAlwaysAllow ? (
                    <Button
                      className="max-sm:min-h-11"
                      disabled={!canRespond}
                      onClick={() => {
                        onAlwaysAllow()
                        respond(approveOption.id)
                      }}
                      size="sm"
                      variant="secondary"
                    >
                      Always allow
                    </Button>
                  ) : null}
                  {denyOption ? (
                    <Button
                      className="max-sm:min-h-11"
                      disabled={!canRespond}
                      onClick={() => respond(denyOption.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Deny
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {inputRequest.options?.map((option) => (
                    <Button
                      className="max-sm:min-h-11"
                      disabled={!canRespond}
                      key={option.id}
                      onClick={() =>
                        void onInputResponses([
                          {
                            optionId: option.id,
                            requestId: inputRequest.requestId,
                          },
                        ])
                      }
                      size="sm"
                      variant={
                        option.style === "danger" ? "destructive" : "default"
                      }
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          {part.state === "output-available" ? (
            <JsonValue label="output" value={part.output} />
          ) : null}
          {part.state === "output-error" ? (
            <p className="text-xs text-destructive">{part.errorText}</p>
          ) : null}
          {part.state === "output-denied" ? (
            <p className="text-xs text-destructive">Tool call denied.</p>
          ) : null}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

function ActionIcon({
  className,
  kind,
}: {
  className?: string
  kind: "skill-call" | "subagent-call" | "tool-call"
}) {
  const Icon =
    kind === "subagent-call"
      ? GitForkIcon
      : kind === "skill-call"
        ? BookOpenIcon
        : WrenchIcon
  return <Icon className={className} />
}

function actionLabel(
  kind: "skill-call" | "subagent-call" | "tool-call",
): string {
  if (kind === "subagent-call") return "Delegated to"
  if (kind === "skill-call") return "Loaded skill"
  return "Tool"
}

export function ToolState({ state }: { state: AgentToolCallPart["state"] }) {
  const done = state === "output-available"
  const failed = state === "output-error" || state === "output-denied"
  const Icon = done ? CheckIcon : failed ? XIcon : CircleIcon

  return (
    <span
      className={cn(
        "flex items-center gap-1 font-mono text-[9px] text-muted-foreground",
        failed ? "text-destructive" : undefined,
      )}
    >
      <Icon
        className={cn(
          "size-2.5",
          !done && !failed ? "animate-pulse" : undefined,
        )}
      />
      {state.replaceAll("-", " ")}
    </span>
  )
}
