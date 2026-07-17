"use client";

// DecisionsPanel — the human's review queue for agent/human PROPOSALS.
//
// Compound (Base UI / pinnable-track style): <Root> takes the decision list +
// the lock callback and provides them via context; <Item> takes one decision
// and provides it via a second, nested context; the leaf parts (<Kind>,
// <Status>, <Title>, <Body>, <Meta>, <LockButton>) each read only what they
// need. The collaboration contract is enforced in the UI the same way it is in
// the data model: Lock is the human-only approval, so <LockButton> renders
// ONLY for `status === "open"` — a locked/superseded decision has no action.
//
// Props-driven: no store, no query, no router. `onLock(id)` is the host's seam;
// pass `lockingId` to show the in-flight row. Status/kind color is SEMANTIC —
// open→warning (awaiting you), locked→success (settled), superseded→muted —
// via the shared tone vocabulary, never raw palette.

import { createContext, useContext, type ReactNode } from "react";
import { cva } from "class-variance-authority";
import { LockIcon, CheckIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { StatusDot } from "@workspace/ui/components/status-dot";
import {
  toneBgVariants,
  toneTextVariants,
  type Tone,
} from "@workspace/ui/lib/tone";
import type { Decision, DecisionStatus } from "@workspace/review/lib/types";

const STATUS_TONE: Record<DecisionStatus, Tone> = {
  open: "warning",
  locked: "success",
  superseded: "muted",
};

// One decision list shares one lock seam; item cards read the list context for
// their action state so a single `lockingId` lights the right row.
interface DecisionsListContextValue {
  onLock?: (id: string) => void;
  lockingId?: string | null;
}
const DecisionsListContext = createContext<DecisionsListContextValue>({});

interface DecisionItemContextValue<TRef> {
  decision: Decision<TRef>;
}
const DecisionItemContext =
  createContext<DecisionItemContextValue<unknown> | null>(null);

function useDecisionItem<TRef = unknown>(): Decision<TRef> {
  const ctx = useContext(DecisionItemContext);
  if (!ctx)
    throw new Error("Decisions parts must render inside <Decisions.Item>");
  return ctx.decision as Decision<TRef>;
}

function Root<TRef = string>({
  decisions,
  onLock,
  lockingId,
  children,
  className,
}: {
  decisions?: readonly Decision<TRef>[];
  onLock?: (id: string) => void;
  lockingId?: string | null;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <DecisionsListContext.Provider value={{ onLock, lockingId }}>
      <section
        data-slot="decisions-panel"
        className={cn("space-y-2", className)}
      >
        {/* Convenience: render the default card per decision when the caller
            passes a list and no explicit children composition. */}
        {children ??
          (decisions && decisions.length > 0 ? (
            decisions.map((d) => <DefaultItem key={d.id} decision={d} />)
          ) : (
            <Empty />
          ))}
      </section>
    </DecisionsListContext.Provider>
  );
}

function Empty({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("px-1 py-2 text-xs text-muted-foreground", className)}>
      {children ?? "No decisions to review."}
    </p>
  );
}

function Item<TRef>({
  decision,
  children,
  className,
}: {
  decision: Decision<TRef>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DecisionItemContext.Provider
      value={{ decision } as DecisionItemContextValue<unknown>}
    >
      <article
        data-slot="decision-item"
        data-status={decision.status}
        data-agent-target={`decision:${decision.id}`}
        className={cn(
          "rounded-lg border border-border/70 bg-card/45 p-3",
          decision.status === "open" && "border-warning/40",
          className,
        )}
      >
        {children}
      </article>
    </DecisionItemContext.Provider>
  );
}

function Title({ className }: { className?: string }) {
  const decision = useDecisionItem();
  return (
    <span className={cn("min-w-0 flex-1 text-sm font-medium", className)}>
      {decision.title}
    </span>
  );
}

const kindBadgeVariants = cva("border-transparent font-mono text-[10px]", {
  variants: {
    tone: {
      primary: cn(
        toneBgVariants({ tone: "primary" }),
        toneTextVariants({ tone: "primary" }),
      ),
      muted: "bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { tone: "muted" },
});

/** The caller-defined taxonomy label (e.g. "canon" | "craft"). Neutral by
 *  default; pass a tone to emphasise a category the host treats as load-bearing. */
function Kind({
  tone = "muted",
  className,
}: {
  tone?: "primary" | "muted";
  className?: string;
}) {
  const decision = useDecisionItem();
  return (
    <Badge
      variant="outline"
      className={cn(kindBadgeVariants({ tone }), className)}
    >
      {decision.kind}
    </Badge>
  );
}

function Status({ className }: { className?: string }) {
  const decision = useDecisionItem();
  const tone = STATUS_TONE[decision.status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-[10px]",
        toneTextVariants({ tone }),
        className,
      )}
    >
      <StatusDot status={tone} size="sm" />
      {decision.status}
    </span>
  );
}

function Body({ className }: { className?: string }) {
  const decision = useDecisionItem();
  return (
    <p
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
    >
      {decision.body}
    </p>
  );
}

function Meta({ className }: { className?: string }) {
  const decision = useDecisionItem();
  return (
    <p
      className={cn(
        "min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground",
        className,
      )}
    >
      proposed by {decision.proposedBy}
      {decision.resolvedBy &&
        decision.status === "locked" &&
        ` · locked by ${decision.resolvedBy}`}
    </p>
  );
}

/** The human-only approval. Renders ONLY for an open decision; a locked one
 *  shows a settled marker, a superseded one shows nothing. */
function LockButton({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const decision = useDecisionItem();
  const { onLock, lockingId } = useContext(DecisionsListContext);

  if (decision.status === "locked") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[10px] text-success",
          className,
        )}
      >
        <CheckIcon className="size-3" /> locked
      </span>
    );
  }
  if (decision.status !== "open") return null;

  const busy = lockingId === decision.id;
  return (
    <Button
      size="sm"
      variant="default"
      disabled={busy || !onLock}
      onClick={() => onLock?.(decision.id)}
      className={className}
    >
      <LockIcon className="size-3" />
      {busy ? "Locking…" : (children ?? "Lock")}
    </Button>
  );
}

/** The default one-card composition — used by <Root> when given a bare list. */
function DefaultItem<TRef>({ decision }: { decision: Decision<TRef> }) {
  return (
    <Item decision={decision}>
      <div className="flex items-center gap-2">
        <Title />
        <Kind />
        <Status />
      </div>
      <div className="mt-1.5">
        <Body />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Meta />
        <LockButton />
      </div>
    </Item>
  );
}

export const Decisions = {
  Root,
  Item,
  Title,
  Kind,
  Status,
  Body,
  Meta,
  LockButton,
  Empty,
};
