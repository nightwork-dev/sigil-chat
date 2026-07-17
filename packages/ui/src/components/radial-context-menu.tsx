"use client"

// Migrated framer-motion -> motion/react, swapped the tooltip's
// hardcoded bg-black/text-white for theme tokens (popover/popover-
// foreground). Demo components (RadialContextMenuDemo,
// RadialContextMenuWithProvider) stripped — see the `interaction`
// showcase category for a themed demo instead.

import * as React from "react"
import { useState, useCallback, createContext, useContext } from "react"
import { motion, AnimatePresence } from "motion/react"
import { createPortal } from "react-dom"
import { cn } from "@workspace/ui/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

export interface RadialMenuItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: () => void
  disabled?: boolean
  shortcut?: string
  variant?: "default" | "destructive" | "outline"
  size?: "sm" | "default" | "lg"
}

const radialMenuItemVariants = cva(
  "flex cursor-pointer select-none items-center justify-center rounded-full text-sm shadow-md outline-none transition-all duration-200 hover:scale-110 focus:ring-2 focus:ring-offset-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus:ring-primary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive",
        outline: "border-2 border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground focus:ring-primary",
      },
      size: {
        sm: "size-10 text-xs",
        default: "size-12 text-sm",
        lg: "size-14 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)

export interface RadialMenuConfig {
  radius?: number
  centerSize?: number
  itemSize?: number
  startAngle?: number
  endAngle?: number
  blur?: boolean
  fixedToElement?: boolean
  animationDuration?: number
}

interface RadialMenuContextType {
  isOpen: boolean
  position: { x: number; y: number }
  items: RadialMenuItem[]
  activeIndex: number
  config: RadialMenuConfig
  open: (x: number, y: number, items: RadialMenuItem[], config?: RadialMenuConfig) => void
  close: () => void
  setActiveIndex: (index: number) => void
  selectActive: () => void
}

const RadialMenuContext = createContext<RadialMenuContextType | null>(null)

export function useRadialMenu() {
  const context = useContext(RadialMenuContext)
  if (!context) throw new Error("useRadialMenu must be used within RadialMenuProvider")
  return context
}

interface RadialMenuProviderProps {
  children: React.ReactNode
  defaultConfig?: RadialMenuConfig
}

export function RadialMenuProvider({ children, defaultConfig = {} }: RadialMenuProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [items, setItems] = useState<RadialMenuItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [config, setConfig] = useState<RadialMenuConfig>({
    radius: 80,
    centerSize: 32,
    itemSize: 48,
    startAngle: 0,
    endAngle: 360,
    blur: false,
    fixedToElement: false,
    animationDuration: 200,
    ...defaultConfig,
  })

  const open = useCallback((x: number, y: number, menuItems: RadialMenuItem[], menuConfig?: RadialMenuConfig) => {
    setPosition({ x, y })
    setItems(menuItems)
    setActiveIndex(-1)
    setConfig((prev) => ({ ...prev, ...menuConfig }))
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
    setItems([])
  }, [])

  const selectActive = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < items.length) {
      const item = items[activeIndex]
      if (!item.disabled) {
        item.action()
        close()
      }
    }
  }, [activeIndex, items, close])

  React.useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          close()
          break
        case "Enter":
        case " ":
          e.preventDefault()
          selectActive()
          break
        case "ArrowUp":
          e.preventDefault()
          setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
          break
        case "ArrowDown":
          e.preventDefault()
          setActiveIndex((prev) => (prev >= items.length - 1 ? 0 : prev + 1))
          break
        case "ArrowLeft":
          e.preventDefault()
          setActiveIndex((prev) => {
            const itemsPerQuarter = Math.ceil(items.length / 4)
            const newIndex = prev - itemsPerQuarter
            return newIndex < 0 ? items.length + newIndex : newIndex
          })
          break
        case "ArrowRight":
          e.preventDefault()
          setActiveIndex((prev) => {
            const itemsPerQuarter = Math.ceil(items.length / 4)
            return (prev + itemsPerQuarter) % items.length
          })
          break
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, selectActive, items.length, close])

  React.useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Element
      if (!target.closest("[data-radial-menu]")) close()
    }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [isOpen, close])

  const contextValue: RadialMenuContextType = { isOpen, position, items, activeIndex, config, open, close, setActiveIndex, selectActive }

  return <RadialMenuContext.Provider value={contextValue}>{children}</RadialMenuContext.Provider>
}

interface RadialMenuProps {
  className?: string
}

export function RadialMenu({ className }: RadialMenuProps) {
  const { isOpen, position, items, activeIndex, setActiveIndex, close, config } = useRadialMenu()
  const { radius = 80, centerSize = 32, itemSize = 48, startAngle, endAngle, blur, animationDuration } = config

  const getItemPosition = (index: number, total: number) => {
    const startRad = (startAngle! * Math.PI) / 180
    const endRad = (endAngle! * Math.PI) / 180
    const arcRange = endRad - startRad
    // A closed 360deg arc has 0deg === 360deg — dividing by (total - 1)
    // like an open arc would put the first and last item on top of each
    // other. Divide by `total` instead so items space out evenly with no
    // seam; open arcs keep dividing by (total - 1) so they still reach
    // both endpoints.
    const isFullCircle = Math.abs(arcRange) >= 2 * Math.PI - 0.001
    const angle =
      total === 1
        ? startRad + arcRange / 2
        : startRad + (index * arcRange) / (isFullCircle ? total : total - 1)
    return { x: Math.cos(angle) * radius!, y: Math.sin(angle) * radius! }
  }

  const handleItemClick = (item: RadialMenuItem, index: number) => {
    if (item.disabled) return
    setActiveIndex(index)
    item.action()
    close()
  }

  if (!isOpen) return null

  const menuContent = (
    <motion.div
      className={cn("pointer-events-auto fixed inset-0 z-50", className)}
      data-radial-menu
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: animationDuration! / 1000 }}
    >
      {blur && <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" onClick={close} />}

      <div className="absolute" style={{ left: position.x, top: position.y, transform: "translate(-50%, -50%)" }}>
        <motion.div
          className="absolute flex items-center justify-center rounded-full border-2 border-border bg-background shadow-lg"
          style={{ width: centerSize, height: centerSize, left: -centerSize / 2, top: -centerSize / 2 }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30, delay: 0.1 }}
        >
          <div className="size-2 rounded-full bg-muted-foreground/50" />
        </motion.div>

        <AnimatePresence>
          {items.map((item, index) => {
            const { x, y } = getItemPosition(index, items.length)
            const isActive = activeIndex === index
            const Icon = item.icon

            return (
              <motion.button
                key={item.id}
                className={cn(
                  "absolute",
                  radialMenuItemVariants({ variant: item.variant || "default", size: item.size || "default" }),
                  isActive && "scale-110 ring-2 ring-primary"
                )}
                data-disabled={item.disabled}
                aria-label={item.label}
                title={`${item.label}${item.shortcut ? ` (${item.shortcut})` : ""}`}
                style={{ width: itemSize, height: itemSize, left: x - itemSize / 2, top: y - itemSize / 2 }}
                onClick={() => handleItemClick(item, index)}
                onMouseEnter={() => setActiveIndex(index)}
                disabled={item.disabled}
                initial={{ scale: 0, rotate: -180, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                exit={{ scale: 0, rotate: 180, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 30, delay: index * 0.01 + animationDuration! / 2000 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className="size-5" />
                <span className="sr-only">{item.label}</span>

                <motion.div
                  className="pointer-events-none absolute rounded bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
                  style={{ bottom: itemSize + 8, left: "50%", transform: "translateX(-50%)" }}
                  animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 4 }}
                  transition={{ duration: animationDuration! / 1000 }}
                >
                  {item.label}
                  {item.shortcut && <span className="ml-2 text-muted-foreground">{item.shortcut}</span>}
                </motion.div>
              </motion.button>
            )
          })}
        </AnimatePresence>

        <svg
          className="pointer-events-none absolute text-muted-foreground"
          style={{ width: radius * 2.5, height: radius * 2.5, left: -radius * 1.25, top: -radius * 1.25 }}
        >
          {items.map((_, index) => {
            const { x, y } = getItemPosition(index, items.length)
            const isActive = activeIndex === index
            return (
              <motion.line
                key={index}
                x1={radius * 1.25}
                y1={radius * 1.25}
                x2={radius * 1.25 + x}
                y2={radius * 1.25 + y}
                stroke="currentColor"
                strokeWidth="1"
                className={cn("transition-opacity duration-200", isActive ? "opacity-30" : "opacity-10")}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: animationDuration! / 1000, delay: index * 0.01 + animationDuration! / 1000 }}
              />
            )
          })}
        </svg>
      </div>
    </motion.div>
  )

  return typeof document !== "undefined" ? createPortal(menuContent, document.body) : null
}

export type { VariantProps }
