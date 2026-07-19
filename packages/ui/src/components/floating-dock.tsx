import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type Ref,
  type RefObject,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDownIcon,
  Maximize2Icon,
  Minimize2Icon,
  PanelRightIcon,
  PictureInPicture2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

interface FloatingDockContextValue {
  detached: boolean;
  expanded: boolean;
  open: boolean;
  panelId: string;
  panelLabelId: string;
  panelRef: RefObject<HTMLElement | null>;
  portalHost: Element | null;
  setDetached: (detached: boolean) => void;
  setExpanded: (expanded: boolean) => void;
  setOpen: (open: boolean) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

const FloatingDockContext = createContext<FloatingDockContextValue | null>(
  null,
);

function useFloatingDock(): FloatingDockContextValue {
  const context = useContext(FloatingDockContext);
  if (!context) {
    throw new Error(
      "FloatingDock parts must be used inside <FloatingDock.Root>.",
    );
  }
  return context;
}

interface FloatingDockRootProps extends ComponentProps<"div"> {
  defaultDetached?: boolean;
  defaultExpanded?: boolean;
  defaultOpen?: boolean;
  detached?: boolean;
  expanded?: boolean;
  onDetachedChange?: (detached: boolean) => void;
  onExpandedChange?: (expanded: boolean) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  panelId?: string;
  /** Move a detached panel into `portalContainer` (or `document.body`).
   * Disable when the caller needs the panel to remain inside its local DOM
   * boundary even while using detached geometry. */
  portal?: boolean;
  portalContainer?: Element | DocumentFragment | null;
}

function Root({
  children,
  className,
  defaultDetached = false,
  defaultExpanded = false,
  defaultOpen = false,
  detached,
  expanded,
  onDetachedChange,
  onExpandedChange,
  onOpenChange,
  open,
  panelId,
  portal = true,
  portalContainer,
  ...props
}: FloatingDockRootProps) {
  const [internalDetached, setInternalDetached] = useState(defaultDetached);
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [portalHost, setPortalHost] = useState<Element | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreTriggerFocusRef = useRef(false);
  const previousOpenRef = useRef(open ?? defaultOpen);
  const generatedPanelId = useId();
  const resolvedPanelId = panelId ?? `floating-dock-${generatedPanelId}`;
  const panelLabelId = `${resolvedPanelId}-label`;
  const resolvedDetached = detached ?? internalDetached;
  const resolvedExpanded = expanded ?? internalExpanded;
  const resolvedOpen = open ?? internalOpen;

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const host = document.createElement("div");
    host.dataset.slot = "floating-dock-portal-host";
    anchor.appendChild(host);
    setPortalHost(host);

    return () => host.remove();
  }, []);

  useEffect(() => {
    if (!portalHost) return;
    const detachedTarget = portal
      ? portalContainer === undefined
        ? document.body
        : portalContainer
      : null;
    const target =
      (resolvedDetached || resolvedExpanded) && detachedTarget
        ? detachedTarget
        : anchorRef.current;

    if (target && portalHost.parentNode !== target) {
      const focusedElement = portalHost.contains(document.activeElement)
        ? document.activeElement
        : null;
      target.appendChild(portalHost);
      if (focusedElement instanceof HTMLElement) {
        focusedElement.focus({ preventScroll: true });
      }
    }
  }, [portal, portalContainer, portalHost, resolvedDetached, resolvedExpanded]);

  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    if (!wasOpen && resolvedOpen) panelRef.current?.focus();
    if (wasOpen && !resolvedOpen && restoreTriggerFocusRef.current) {
      triggerRef.current?.focus();
      restoreTriggerFocusRef.current = false;
    }
    previousOpenRef.current = resolvedOpen;
  }, [resolvedOpen]);

  const setDetached = (nextDetached: boolean) => {
    if (detached === undefined) setInternalDetached(nextDetached);
    onDetachedChange?.(nextDetached);
  };

  const setExpanded = (nextExpanded: boolean) => {
    if (expanded === undefined) setInternalExpanded(nextExpanded);
    onExpandedChange?.(nextExpanded);
  };

  const setOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      restoreTriggerFocusRef.current = Boolean(
        panelRef.current?.contains(document.activeElement),
      );
    }
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <FloatingDockContext.Provider
      value={{
        detached: resolvedDetached,
        expanded: resolvedExpanded,
        open: resolvedOpen,
        panelId: resolvedPanelId,
        panelLabelId,
        panelRef,
        portalHost,
        setDetached,
        setExpanded,
        setOpen,
        triggerRef,
      }}
    >
      <div
        data-detached={resolvedDetached || undefined}
        data-expanded={resolvedExpanded || undefined}
        data-open={resolvedOpen || undefined}
        data-slot="floating-dock-root"
        className={cn(
          "fixed right-4 bottom-4 z-30 grid w-[min(400px,calc(100%_-_2rem))] max-sm:right-auto max-sm:bottom-2 max-sm:left-2",
          className,
        )}
        {...props}
      >
        <div ref={anchorRef} data-slot="floating-dock-anchor" />
        {children}
      </div>
    </FloatingDockContext.Provider>
  );
}

type FloatingDockTriggerProps = ComponentProps<typeof Button>;

function Trigger({
  children = "Open panel",
  className,
  onClick,
  ref,
  size = "default",
  variant = "outline",
  "aria-label": ariaLabel = "Open floating panel",
  ...props
}: FloatingDockTriggerProps) {
  const { open, panelId, setOpen, triggerRef } = useFloatingDock();

  return (
    <Button
      {...props}
      ref={(node) => {
        triggerRef.current = node;
        assignRef(ref, node);
      }}
      aria-label={ariaLabel}
      aria-controls={panelId}
      aria-expanded={open}
      hidden={open}
      className={cn("max-w-full justify-self-end", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
      size={size}
      variant={variant}
    >
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-ellipsis whitespace-nowrap">
        {children}
      </span>
      <ChevronDownIcon
        className="-rotate-90 text-muted-foreground"
        data-icon="inline-end"
      />
    </Button>
  );
}

interface FloatingDockPanelProps extends Omit<
  ComponentProps<"section">,
  "id" | "title"
> {
  actions?: ReactNode;
  description?: ReactNode;
  heading?: ReactNode;
}

function Panel({
  actions,
  children,
  className,
  description,
  heading = "Panel",
  ref,
  role = "region",
  tabIndex = -1,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: FloatingDockPanelProps) {
  const {
    detached,
    expanded,
    open,
    panelId,
    panelLabelId,
    panelRef,
    portalHost,
    setDetached,
    setOpen,
  } = useFloatingDock();
  if (!open) return null;

  const panel = (
    <section
      {...props}
      ref={(node) => {
        panelRef.current = node;
        assignRef(ref, node);
      }}
      id={panelId}
      role={role}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy ?? (ariaLabel ? undefined : panelLabelId)}
      data-detached={detached || undefined}
      data-expanded={expanded || undefined}
      data-slot="floating-dock-panel"
      className={cn(
        "grid min-w-0 grid-rows-[44px_minmax(0,1fr)] overflow-hidden rounded-xl border border-border bg-popover shadow-xl",
        // Native CSS resizing writes inline dimensions. Docked geometry must
        // override those values when the panel returns to its anchor.
        !detached &&
          !expanded &&
          "h-[min(560px,calc(100dvh-2rem))]! w-full! resize-none max-sm:h-[min(70dvh,520px)]!",
        detached &&
          !expanded &&
          "fixed right-4 bottom-4 z-[80] h-[min(560px,calc(100dvh-2rem))] w-[min(400px,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] resize max-sm:right-2 max-sm:bottom-2 max-sm:h-[min(70dvh,520px)] max-sm:w-[calc(100vw-1rem)] max-sm:max-h-[calc(100dvh-1rem)] max-sm:max-w-[calc(100vw-1rem)]",
        expanded &&
          "fixed inset-4 z-[80] h-[calc(100dvh-2rem)]! w-[calc(100vw-2rem)]! max-h-none max-w-none resize-none max-sm:inset-2 max-sm:h-[calc(100dvh-1rem)]! max-sm:w-[calc(100vw-1rem)]!",
        className,
      )}
    >
      <header className="flex min-w-0 items-center justify-between gap-2 border-b border-border px-3">
        {heading || description ? (
          <div className="min-w-0">
            {heading ? (
              <p id={panelLabelId} className="truncate text-xs font-medium">
                {heading}
              </p>
            ) : null}
            {description ? (
              <p className="truncate text-[10px] text-muted-foreground max-sm:hidden">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {expanded ? null : (
            <Button
              aria-label={
                detached ? "Dock floating panel" : "Detach floating panel"
              }
              className="max-sm:size-11"
              onClick={() => setDetached(!detached)}
              size="icon-xs"
              title={detached ? "Dock floating panel" : "Detach floating panel"}
              variant="ghost"
            >
              {detached ? <PanelRightIcon /> : <PictureInPicture2Icon />}
            </Button>
          )}
          <Button
            aria-label="Collapse floating panel"
            className="max-sm:size-11"
            onClick={() => setOpen(false)}
            size="icon-xs"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      </header>
      <div
        data-slot="floating-dock-content"
        className="min-h-0 overflow-y-auto overscroll-contain"
      >
        {children}
      </div>
    </section>
  );

  return portalHost ? createPortal(panel, portalHost) : panel;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

type FloatingDockExpandProps = ComponentProps<typeof Button>;

function Expand({
  children,
  className,
  onClick,
  render,
  ...props
}: FloatingDockExpandProps) {
  const { expanded, setExpanded } = useFloatingDock();
  const label = expanded ? "Restore floating panel" : "Expand floating panel";

  return (
    <Button
      aria-label={label}
      className={cn("max-sm:size-11", className)}
      nativeButton={render ? false : undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!render && !event.defaultPrevented) setExpanded(!expanded);
      }}
      render={render}
      size={children ? "sm" : "icon-xs"}
      title={label}
      variant="ghost"
      {...props}
    >
      {expanded ? (
        <Minimize2Icon data-icon={children ? "inline-start" : undefined} />
      ) : (
        <Maximize2Icon data-icon={children ? "inline-start" : undefined} />
      )}
      {children}
    </Button>
  );
}

export const FloatingDock = { Root, Trigger, Panel, Expand };
export { useFloatingDock };
export type {
  FloatingDockContextValue,
  FloatingDockExpandProps,
  FloatingDockPanelProps,
  FloatingDockRootProps,
  FloatingDockTriggerProps,
};
