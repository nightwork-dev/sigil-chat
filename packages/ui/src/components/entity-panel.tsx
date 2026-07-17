"use client"

// A card for any named/described entity — click-to-edit name + description
// in the header, an actions menu (rename/duplicate/delete/reset) revealed on
// hover, and a content slot below. Generalizes the common "CRUD record
// panel" shape: works for documents, characters, scenarios, anything with a
// name, an optional description, and a handful of lifecycle actions.

import { createContext, useContext, type ReactNode } from "react"
import { EllipsisIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { ClickToEdit } from "@workspace/ui/components/click-to-edit"
import { Button } from "@workspace/ui/components/button"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@workspace/ui/components/dropdown-menu"

export interface EntityPanelEntity {
  id: string
  name: string
  description?: string
  visible?: boolean
}

export interface EntityPanelActions {
  onRename?: (name: string) => void
  onDescribe?: (description: string) => void
  onVisibilityChange?: (visible: boolean) => void
  onDuplicate?: () => void
  onDelete?: () => void
  onReset?: () => void
}

interface EntityPanelContextValue {
  entity: EntityPanelEntity
  editable: boolean
  actions: EntityPanelActions
}

const Ctx = createContext<EntityPanelContextValue | null>(null)

function useEntityPanel() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("EntityPanel parts must be used inside <EntityPanel.Root>")
  return ctx
}

function Root({
  entity,
  editable = false,
  actions = {},
  children,
  className,
}: {
  entity: EntityPanelEntity
  editable?: boolean
  actions?: EntityPanelActions
  children: ReactNode
  className?: string
}) {
  return (
    <Ctx.Provider value={{ entity, editable, actions }}>
      <div
        data-slot="entity-panel"
        className={cn("group relative flex flex-col gap-3 truncate rounded-md border border-border p-2 pb-4 transition-all", className)}
      >
        {children}
      </div>
    </Ctx.Provider>
  )
}

function Header({ icon, className }: { icon?: ReactNode; className?: string }) {
  const { entity, editable, actions } = useEntityPanel()

  return (
    <div data-slot="entity-panel-header" className={cn("relative flex w-full", className)}>
      {icon}
      <div className="flex grow flex-col gap-1 pl-2">
        {editable ? (
          <>
            <ClickToEdit
              as="span"
              value={entity.name}
              onCommit={(name) => actions.onRename?.(name)}
              className="truncate font-mono text-sm"
            />
            {(entity.description || actions.onDescribe) && (
              <ClickToEdit
                as="span"
                value={entity.description ?? ""}
                onCommit={(description) => actions.onDescribe?.(description)}
                placeholder="Add a description"
                className="text-sm text-muted-foreground"
              />
            )}
          </>
        ) : (
          <>
            <h3 className="truncate font-mono text-sm">{entity.name}</h3>
            {entity.description && <p className="text-xs text-muted-foreground">{entity.description}</p>}
          </>
        )}
      </div>

      <div className="absolute right-0 top-0 flex items-center gap-1 opacity-20 transition-opacity delay-75 group-hover:opacity-100">
        {actions.onVisibilityChange && (
          <Toggle
            size="sm"
            pressed={entity.visible ?? true}
            onPressedChange={actions.onVisibilityChange}
            aria-label="Toggle visibility"
          >
            {entity.visible ?? true ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
          </Toggle>
        )}
        {(actions.onDuplicate || actions.onDelete || actions.onReset) && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
              <EllipsisIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.onDuplicate && <DropdownMenuItem onClick={actions.onDuplicate}>Duplicate</DropdownMenuItem>}
              {actions.onReset && <DropdownMenuItem onClick={actions.onReset}>Reset</DropdownMenuItem>}
              {actions.onDelete && (
                <DropdownMenuItem variant="destructive" onClick={actions.onDelete}>
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}

function Content({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-slot="entity-panel-content" className={cn("flex grow flex-col", className)}>
      {children}
    </div>
  )
}

export const EntityPanel = { Root, Header, Content }
