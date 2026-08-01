"use client"

// The canvas control cluster, shared by every React Flow surface in the app.
//
// Extracted verbatim from ReducerStudio, which is where the design language for
// it was set: a rounded group floating bottom-left, quiet ghost buttons, one
// tooltip each. React Flow's own <Controls> is a white box that belongs to a
// different product, so nothing here should render it.
//
// The lock is optional because it means something only where there is editing
// to lock. A read-only canvas gets zoom and fit and nothing else — a control
// that can never change anything is a control that means nothing.
//
// This lives beside use-stable-flow-nodes for the same reason: @xyflow/react is
// not in the UI package's dependency graph, and both consumers are app routes.
// It earns a package the moment something outside apps/web needs it.

import type { ReactNode } from "react"
import { Panel, useReactFlow } from "@xyflow/react"
import {
  FocusIcon,
  LockIcon,
  UnlockIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

export interface CanvasControlsProps {
  /**
   * Present only on an editable canvas. Omit both and the cluster is zoom and
   * fit alone.
   */
  editingEnabled?: boolean
  onEditingEnabledChange?: (enabled: boolean) => void
}

export function CanvasControls({
  editingEnabled,
  onEditingEnabledChange,
}: CanvasControlsProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const lockable =
    editingEnabled !== undefined && onEditingEnabledChange !== undefined

  return (
    <Panel className="m-3!" position="bottom-left">
      <div
        aria-label="Canvas controls"
        className="flex items-center gap-0.5 rounded-md border border-border bg-background/90 p-0.5 shadow-md backdrop-blur"
        role="toolbar"
      >
        <CanvasControlButton
          label="Zoom in"
          onClick={() => void zoomIn({ duration: 120 })}
        >
          <ZoomInIcon />
        </CanvasControlButton>
        <CanvasControlButton
          label="Zoom out"
          onClick={() => void zoomOut({ duration: 120 })}
        >
          <ZoomOutIcon />
        </CanvasControlButton>
        <CanvasControlButton
          label="Fit graph"
          onClick={() =>
            void fitView({ duration: 180, maxZoom: 1.1, padding: 0.18 })
          }
        >
          <FocusIcon />
        </CanvasControlButton>
        {lockable ? (
          <>
            <Separator className="mx-0.5 h-4!" orientation="vertical" />
            <CanvasControlButton
              active={!editingEnabled}
              label={
                editingEnabled ? "Lock graph editing" : "Unlock graph editing"
              }
              onClick={() => onEditingEnabledChange(!editingEnabled)}
            >
              {editingEnabled ? <LockIcon /> : <UnlockIcon />}
            </CanvasControlButton>
          </>
        ) : null}
      </div>
    </Panel>
  )
}

function CanvasControlButton({
  active = false,
  children,
  label,
  onClick,
}: {
  active?: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            onClick={onClick}
            size="icon-sm"
            variant={active ? "secondary" : "ghost"}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
