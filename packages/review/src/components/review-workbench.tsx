"use client";

// ReviewWorkbench — the responsive shell that gathers the whole review loop
// into one place: a right-side Sheet on desktop, a bottom Drawer on a phone
// (the same interaction split as responsive-overlay), holding a tabbed body
// whose panels are the review surfaces — Decisions, Debt, Feedback, Accept.
//
// Compound (Root/Parts + context): <Root> owns the responsive overlay + the
// trigger + the open state seam and provides `isMobile` via context; <Tabs>
// takes a tab config and renders the tab bar + panels, with an optional
// `minimap` slot (e.g. <ReviewMinimap> from @workspace/ui) as a desktop rail.
//
// Props-driven: the host composes the panels (the other @workspace/review
// components wired to its data) and passes them as tab `content`. This shell
// knows nothing about decisions or annotations — only how to hold them.
//
// The Sheet/Drawer content is a flex column with a constrained height so the
// active panel scrolls inside the sheet, never pushing the tab bar off-screen.

import {
  createContext,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { useIsMobile } from "@workspace/ui/hooks/use-mobile";
import { Badge } from "@workspace/ui/components/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@workspace/ui/components/sheet";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@workspace/ui/components/drawer";

interface WorkbenchContextValue {
  isMobile: boolean;
}
const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

type WorkbenchSize = "sm" | "md" | "lg";

const SHEET_WIDTH: Record<WorkbenchSize, string> = {
  sm: "28rem",
  md: "36rem",
  lg: "48rem",
};

function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx)
    throw new Error(
      "ReviewWorkbench parts must render inside <ReviewWorkbench.Root>",
    );
  return ctx;
}

function Root({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  side = "right",
  size = "md",
  children,
  className,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  /** Controlled open state; omit for uncontrolled (the trigger drives it). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Desktop Sheet side (default right). Mobile is always a bottom Drawer. */
  side?: "right" | "left";
  /** Desktop review width. Mobile always uses the available viewport width. */
  size?: WorkbenchSize;
  children: ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();

  const body = (
    <WorkbenchContext.Provider value={{ isMobile }}>
      {children}
    </WorkbenchContext.Provider>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent data-slot="review-workbench" className="max-h-[88vh]">
          <DrawerHeader className="pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {description && (
              <DrawerDescription>{description}</DrawerDescription>
            )}
          </DrawerHeader>
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-6",
              className,
            )}
          >
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent
        side={side}
        data-slot="review-workbench"
        className="min-w-0 gap-0"
        style={{
          width: SHEET_WIDTH[size],
          maxWidth: "calc(100vw - 1rem)",
        }}
      >
        <SheetHeader className="border-b border-border/60 pr-14">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-4",
            className,
          )}
        >
          {body}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export interface WorkbenchTab {
  value: string;
  label: string;
  icon?: LucideIcon;
  /** A "needs you" count (e.g. open decisions / orphan debt) shown as a badge. */
  count?: number;
  content: ReactNode;
}

function TabbedBody({
  tabs,
  defaultValue,
  value,
  onValueChange,
  minimap,
  lazy = true,
  className,
}: {
  tabs: WorkbenchTab[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  /** Optional desktop rail (e.g. <ReviewMinimap>); hidden on mobile. */
  minimap?: ReactNode;
  /** Mount only the active panel. Useful when panels own queries or expensive editors. */
  lazy?: boolean;
  className?: string;
}) {
  const { isMobile } = useWorkbench();
  const initial = defaultValue ?? tabs[0]?.value;
  const [uncontrolledValue, setUncontrolledValue] = useState(initial);
  const activeValue = value ?? uncontrolledValue;

  const handleValueChange = (nextValue: string) => {
    if (value === undefined) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };

  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 gap-3", className)}>
      <Tabs
        defaultValue={value === undefined ? initial : undefined}
        value={value}
        onValueChange={handleValueChange}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
      >
        <div className="max-w-full overflow-x-auto pb-1">
          <TabsList className="min-w-full w-max justify-start">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="flex-none px-2.5"
              >
                {tab.icon && <tab.icon />}
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-0.5 h-4 min-w-4 px-1 font-mono text-[9px]"
                  >
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="min-h-0 flex-1 overflow-y-auto pr-1"
          >
            {!lazy || activeValue === tab.value ? tab.content : null}
          </TabsContent>
        ))}
      </Tabs>
      {!isMobile && minimap}
    </div>
  );
}

export const ReviewWorkbench = { Root, Tabs: TabbedBody };
