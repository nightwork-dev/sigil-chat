import { KeyRoundIcon } from "lucide-react"

import type { AgentAuthorizationPart } from "@zigil/agent-surface/contracts"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"

export function AuthorizationCard({ part }: { part: AgentAuthorizationPart }) {
  return (
    <Card className="gap-2 p-3" size="sm">
      <div className="flex items-center gap-2 font-medium">
        <KeyRoundIcon className="size-3.5 text-muted-foreground" />
        {part.state === "required"
          ? `Connect ${part.displayName}`
          : `${part.displayName} ${part.outcome}`}
      </div>
      <p className="mt-1 text-muted-foreground">{part.description}</p>
      {part.state === "required" && part.authorizationUrl ? (
        <Button
          className="mt-3 max-sm:min-h-11"
          render={
            <a href={part.authorizationUrl} rel="noreferrer" target="_blank" />
          }
          size="sm"
        >
          Open authorization
        </Button>
      ) : null}
    </Card>
  )
}
