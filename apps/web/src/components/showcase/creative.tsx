import { useEffect, useState } from "react"
import { ColorWheel } from "@workspace/ui/components/creative/color-wheel"
import { ColorInput } from "@workspace/ui/components/creative/color-input"
import { GradientEditor, type GradientStop } from "@workspace/ui/components/creative/gradient-editor"
import { PianoRoll, type PianoNote } from "@workspace/ui/components/creative/piano-roll"
import { RingBuffer } from "@workspace/ui/components/creative/ring-buffer"
import { Terminal, type TerminalEntry } from "@workspace/ui/components/creative/terminal"
import { TreeView, type TreeNode } from "@workspace/ui/components/creative/tree-view"
import { VectorEditor, type VectorShape } from "@workspace/ui/components/creative/vector-editor"
import { Exhibit } from "@/components/showcase/exhibit"
import { BezierEditorProvider, BezierCanvas, CurveList, AddCurveButton, ExportControls } from "@workspace/ui/components/bezier-curve-editor"

export function CreativeShowcase() {
  const [hue, setHue] = useState(210)
  const [sat, setSat] = useState(0.8)
  const [bri, setBri] = useState(0.9)
  const [inkColor, setInkColor] = useState("#5b9dc4")
  const [gradStops, setGradStops] = useState<GradientStop[]>([
    { id: "g0", color: "#6366F1", position: 0 },
    { id: "g1", color: "#EC4899", position: 0.5 },
    { id: "g2", color: "#F59E0B", position: 1 },
  ])
  const [pianoNotes, setPianoNotes] = useState<PianoNote[]>([
    { id: "n0", pitch: 64, step: 0, velocity: 0.9 },
    { id: "n1", pitch: 64, step: 1, velocity: 0.8 },
    { id: "n2", pitch: 65, step: 2, velocity: 0.85 },
    { id: "n3", pitch: 67, step: 3, velocity: 0.9 },
    { id: "n4", pitch: 67, step: 4, velocity: 0.85 },
    { id: "n5", pitch: 65, step: 5, velocity: 0.8 },
    { id: "n6", pitch: 64, step: 6, velocity: 0.85 },
    { id: "n7", pitch: 62, step: 7, velocity: 0.75 },
  ])
  const [ringData, setRingData] = useState<number[][]>([
    Array.from({ length: 64 }, () => Math.random() * 0.8),
    Array.from({ length: 64 }, () => Math.random() * 0.6),
  ])
  const [ringAngle, setRingAngle] = useState(0)
  const [termEntries] = useState<TerminalEntry[]>([
    { id: "t0", message: "system boot initiated", severity: "info", timestamp: "00:00:01" },
    { id: "t1", message: "loading kernel modules...", severity: "info", timestamp: "00:00:01" },
    { id: "t2", message: "sigil-engine v2.4.1 starting", severity: "info", timestamp: "00:00:04" },
    { id: "t3", message: "deprecated API call in SDLegacy", severity: "warn", timestamp: "00:00:05" },
    { id: "t4", message: "failed to load optional plugin: analytics", severity: "error", timestamp: "00:00:07" },
    { id: "t5", message: "system ready", severity: "info", timestamp: "00:00:09" },
  ])
  const [treeNodes, setTreeNodes] = useState<TreeNode[]>([
    {
      id: "src", label: "src", icon: "folder", children: [
        {
          id: "components", label: "components", icon: "folder", isExpanded: true, children: [
            { id: "button", label: "Button.tsx", icon: "file" },
            { id: "card", label: "Card.tsx", icon: "file" },
          ]
        },
        { id: "app", label: "App.tsx", icon: "file" },
      ], isExpanded: true,
    },
    {
      id: "tests", label: "tests", icon: "folder", children: [
        { id: "test1", label: "Button.test.tsx", icon: "file" },
      ]
    },
    { id: "readme", label: "README.md", icon: "file" },
  ])
  const [treeSelection, setTreeSelection] = useState<string | undefined>()
  const [vectorShapes, setVectorShapes] = useState<VectorShape[]>([
    { id: "s0", type: "rectangle", position: { x: 40, y: 40 }, size: { x: 100, y: 70 }, rotation: 0, color: "var(--color-primary)", strokeWidth: 2, opacity: 1 },
    { id: "s1", type: "circle", position: { x: 200, y: 60 }, size: { x: 80, y: 80 }, rotation: 0, color: "var(--color-chart-2)", strokeWidth: 2, opacity: 0.9, locked: true },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setRingAngle((a) => a + 2)
      setRingData((prev) =>
        prev.map((ring) => {
          const next = [...ring, Math.random() * 0.9]
          if (next.length > 64) next.shift()
          return next
        })
      )
    }, 150)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="Color Wheel" subtitle="HSB · drag to select" installName="color-wheel">
          <div className="flex justify-center">
            <ColorWheel
              hue={hue}
              saturation={sat}
              brightness={bri}
              onChange={({ hue: h, saturation: s, brightness: b }) => {
                setHue(h)
                setSat(s)
                setBri(b)
              }}
              size={160}
            />
          </div>
        </Exhibit>

        <Exhibit title="Gradient Editor" subtitle="draggable stops" installName="gradient-editor">
          <GradientEditor stops={gradStops} onChange={setGradStops} />
        </Exhibit>
      </div>

      <Exhibit title="Color Input" subtitle="compact inline HSB · swatch + H/S/B channels" installName="color-input">
        <div className="flex justify-center">
          <ColorInput value={inkColor} onChange={setInkColor} />
        </div>
      </Exhibit>

      <Exhibit title="Piano Roll" subtitle="MIDI note editor" installName="piano-roll">
        <div className="overflow-x-auto">
          <PianoRoll notes={pianoNotes} onChange={setPianoNotes} steps={16} pitchRange={[48, 72]} cellSize={16} />
        </div>
      </Exhibit>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="Ring Buffer" subtitle="circular data · sweep" installName="ring-buffer">
          <div className="flex justify-center">
            <RingBuffer data={ringData} pointCount={64} colors={["hsl(var(--primary))", "#22c55e"]} size={160} sweepAngle={ringAngle} />
          </div>
        </Exhibit>

        <Exhibit title="Terminal" subtitle="log viewer · severity" installName="terminal">
          <Terminal entries={termEntries} showLineNumbers maxVisibleLines={8} fontSize={10} />
        </Exhibit>
      </div>

      <Exhibit title="Tree View" subtitle="expandable hierarchy · drag rows to reorder" installName="tree-view">
        <div className="max-h-48">
          <TreeView
            nodes={treeNodes}
            selection={treeSelection}
            onSelect={setTreeSelection}
            onToggle={(id) => {
              const toggle = (list: TreeNode[]): TreeNode[] =>
                list.map((n) => (n.id === id ? { ...n, isExpanded: !n.isExpanded } : n.children ? { ...n, children: toggle(n.children) } : n))
              setTreeNodes(toggle(treeNodes))
            }}
            onReorder={setTreeNodes}
          />
        </div>
      </Exhibit>

      <Exhibit title="Vector Editor" subtitle="lockable shapes, constraint-editor control surface" installName="vector-editor">
        <VectorEditor shapes={vectorShapes} onShapesChange={setVectorShapes} width={520} height={320} />
      </Exhibit>

      <Exhibit title="Bezier Curve Editor" subtitle="d3 curves, Curve.Root/Visual/Card compound" installName="bezier-curve-editor">
        <BezierEditorProvider>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Canvas</span>
                <ExportControls />
              </div>
              <BezierCanvas />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Curves</span>
                <AddCurveButton />
              </div>
              <CurveList />
            </div>
          </div>
        </BezierEditorProvider>
      </Exhibit>
    </div>
  )
}
