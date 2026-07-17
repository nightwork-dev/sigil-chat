import { useRef, useEffect, type ReactNode } from "react";
import { cn } from "@workspace/ui/lib/utils";

/**
 * Scrollable message container with auto-scroll-to-bottom.
 *
 * Auto-scrolls when new content is added (children change) IF the user
 * is already near the bottom. If the user has scrolled up to read history,
 * we don't yank them back down.
 *
 * Optional turn separator between messages.
 */
export function ChatList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  // Track whether user is near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleScroll() {
      if (!el) return;
      const threshold = 80;
      stickRef.current =
        el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll when children change
  useEffect(() => {
    if (stickRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [children]);

  return (
    <div
      ref={scrollRef}
      className={cn("min-w-0 flex-1 overflow-y-auto", className)}
    >
      <div className="flex min-w-0 max-w-full flex-col gap-5 p-4">
        {children}
      </div>
    </div>
  );
}

/**
 * Visual separator between conversation turns.
 * A thin line with optional label (e.g. timestamp, "new messages").
 */
export function ChatSeparator({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 py-1", className)}>
      <div className="flex-1 border-t border-border" />
      {label && (
        <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
          {label}
        </span>
      )}
      <div className="flex-1 border-t border-border" />
    </div>
  );
}
