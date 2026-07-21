"use client";

// Demo annotation injection — a deterministic, local-only way to SEE overlay
// projection without waiting for the LLM to call sigil-annotate.
//
// This is DEMO SCAFFOLDING, not production path. The real annotations come from
// useAgentAnnotationsByAnchor (reading the agent session's tool-call outputs).
// This context lets a "demo" button drop a synthetic annotation on a target so
// the visual is reproducible for screenshots, review, and手感 (feel). It is
// clearly separated from the real hook so the two never blur.
//
// Remove when the agent reliably annotates on its own (or keep behind a dev flag).

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AgentAnnotation } from "@/lib/agent-annotations";

interface DemoAnnotationsValue {
  readonly byAnchor: ReadonlyMap<string, readonly AgentAnnotation[]>;
  readonly add: (anchorId: string, annotation: Omit<AgentAnnotation, "toolCallId" | "anchorId">) => void;
  readonly clear: () => void;
}

const DemoAnnotationsContext = createContext<DemoAnnotationsValue | null>(null);

export function DemoAnnotationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<AgentAnnotation[]>([]);

  const value = useMemo<DemoAnnotationsValue>(() => {
    const byAnchor = new Map<string, AgentAnnotation[]>();
    for (const a of items) {
      const list = byAnchor.get(a.anchorId) ?? [];
      list.push(a);
      byAnchor.set(a.anchorId, list);
    }
    return {
      byAnchor,
      add: (anchorId, annotation) =>
        setItems((prev) => [
          ...prev,
          {
            ...annotation,
            anchorId,
            toolCallId: `demo-${Date.now()}`,
          },
        ]),
      clear: () => setItems([]),
    };
  }, [items]);

  return (
    <DemoAnnotationsContext.Provider value={value}>
      {children}
    </DemoAnnotationsContext.Provider>
  );
}

export function useDemoAnnotations(): DemoAnnotationsValue | null {
  return useContext(DemoAnnotationsContext);
}

/**
 * Merge real session annotations with demo ones (demo appended). Used by the
 * node/passage render so a single read covers both sources.
 */
export function mergeDemoAnnotations(
  real: readonly AgentAnnotation[] | undefined,
  demo: readonly AgentAnnotation[] | undefined,
): readonly AgentAnnotation[] {
  if (!real && !demo) return [];
  if (!real) return demo!;
  if (!demo) return real;
  return [...real, ...demo];
}
