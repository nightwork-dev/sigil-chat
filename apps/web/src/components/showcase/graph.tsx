import { GraphCanvas, useGraphState } from "@workspace/ui/components/graph/graph-canvas"
import { DiagramNode } from "@workspace/ui/components/graph/diagram-node"
import { Exhibit } from "@/components/showcase/exhibit"

export function GraphShowcase() {
  const graphState = useGraphState(
    [
      { id: 0, label: "Consciousness", group: 0, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 1, label: "Perception", group: 1, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 2, label: "Memory", group: 1, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 3, label: "Language", group: 2, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 4, label: "Emotion", group: 3, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 5, label: "Qualia", group: 0, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 6, label: "Attention", group: 1, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 7, label: "Learning", group: 2, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 8, label: "Identity", group: 4, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
      { id: 9, label: "Free Will", group: 4, position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, pinned: false, depth: 0 },
    ],
    [
      { id: 0, source: 0, target: 1, weight: 1, type: "dependency" as const },
      { id: 1, source: 0, target: 4, weight: 0.9, type: "dependency" as const },
      { id: 2, source: 0, target: 8, weight: 0.8, type: "dependency" as const },
      { id: 3, source: 1, target: 5, weight: 0.9, type: "association" as const },
      { id: 4, source: 1, target: 6, weight: 0.8, type: "dependency" as const },
      { id: 5, source: 2, target: 7, weight: 0.9, type: "dependency" as const },
      { id: 6, source: 3, target: 7, weight: 0.8, type: "dependency" as const },
      { id: 7, source: 4, target: 1, weight: 0.7, type: "association" as const },
      { id: 8, source: 6, target: 2, weight: 0.8, type: "dependency" as const },
      { id: 9, source: 8, target: 9, weight: 0.8, type: "dependency" as const },
    ]
  )

  return (
    <div className="space-y-4 p-6">
      <Exhibit title="Force-Directed Graph" subtitle="knowledge graph · pan + zoom" installName="graph-canvas">
        <GraphCanvas state={graphState} className="h-[500px] w-full rounded-md" />
      </Exhibit>

      <Exhibit title="Diagram Node" subtitle="tile + compact variants" installName="diagram-node">
        <div className="flex items-center justify-center gap-4">
          <DiagramNode.Root id="n1" label="Ambient Pad" type="voice" description="Slow attack, wide stereo">
            <DiagramNode.Tile width={140} height={100} />
          </DiagramNode.Root>
          <DiagramNode.Root id="n2" label="Bass" type="voice">
            <DiagramNode.Compact />
          </DiagramNode.Root>
        </div>
      </Exhibit>
    </div>
  )
}
