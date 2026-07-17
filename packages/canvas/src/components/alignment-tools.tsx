import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  AlignStartVerticalIcon,
  AlignCenterVerticalIcon,
  AlignEndVerticalIcon,
  AlignStartHorizontalIcon,
  AlignCenterHorizontalIcon,
  AlignEndHorizontalIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignVerticalDistributeCenterIcon,
} from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"

export type AlignAction =
  | "left" | "center-h" | "right"
  | "top" | "center-v" | "bottom"
  | "distribute-h" | "distribute-v"

const ACTIONS: { action: AlignAction; icon: typeof AlignStartVerticalIcon; label: string }[] = [
  { action: "left", icon: AlignStartVerticalIcon, label: "Align left" },
  { action: "center-h", icon: AlignCenterVerticalIcon, label: "Align center" },
  { action: "right", icon: AlignEndVerticalIcon, label: "Align right" },
]

const VERT_ACTIONS: typeof ACTIONS = [
  { action: "top", icon: AlignStartHorizontalIcon, label: "Align top" },
  { action: "center-v", icon: AlignCenterHorizontalIcon, label: "Align middle" },
  { action: "bottom", icon: AlignEndHorizontalIcon, label: "Align bottom" },
]

const DIST_ACTIONS: typeof ACTIONS = [
  { action: "distribute-h", icon: AlignHorizontalDistributeCenterIcon, label: "Distribute horizontal" },
  { action: "distribute-v", icon: AlignVerticalDistributeCenterIcon, label: "Distribute vertical" },
]

/**
 * Alignment toolbar for multi-selection in spatial editors.
 * Disabled when fewer than 2 items are selected.
 * Distribution requires 3+ items.
 */
export function AlignmentTools({
  selectedCount,
  onAlign,
  direction = "horizontal",
  className,
}: {
  selectedCount: number
  onAlign: (action: AlignAction) => void
  direction?: "horizontal" | "vertical"
  className?: string
}) {
  const isRow = direction === "horizontal"

  return (
    <div className={cn("flex items-center gap-0.5", isRow ? "flex-row" : "flex-col", className)}>
      {ACTIONS.map(({ action, icon: Icon, label }) => (
        <Button
          key={action}
          variant="ghost"
          size="icon-xs"
          disabled={selectedCount < 2}
          onClick={() => onAlign(action)}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}

      <Separator orientation={isRow ? "vertical" : "horizontal"} className={isRow ? "h-4 mx-0.5" : "w-4 my-0.5"} />

      {VERT_ACTIONS.map(({ action, icon: Icon, label }) => (
        <Button
          key={action}
          variant="ghost"
          size="icon-xs"
          disabled={selectedCount < 2}
          onClick={() => onAlign(action)}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}

      <Separator orientation={isRow ? "vertical" : "horizontal"} className={isRow ? "h-4 mx-0.5" : "w-4 my-0.5"} />

      {DIST_ACTIONS.map(({ action, icon: Icon, label }) => (
        <Button
          key={action}
          variant="ghost"
          size="icon-xs"
          disabled={selectedCount < 3}
          onClick={() => onAlign(action)}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  )
}
