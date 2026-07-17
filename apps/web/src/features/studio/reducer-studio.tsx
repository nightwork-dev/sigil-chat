import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react"
import {
  Background,
  BackgroundVariant,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react"
import { Link } from "@tanstack/react-router"
import {
  CircleAlertIcon,
  FocusIcon,
  LockIcon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  Trash2Icon,
  UnlockIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"

import {
  useReducerGraph,
  useReducerGraphCommand,
  useReducerGraphRun,
  useReducerGraphUndo,
} from "@/features/studio/reducer-data"
import { useAttentionTelemetry } from "@zigil/agent-react/attention-telemetry"
import { AgentHud } from "@/components/agent/agent-hud"
import { getAgentTargetProps } from "@/lib/agent-dom-effects"
import {
  setToolApprovalMode,
  useToolApprovalMode,
} from "@/lib/agent-tool-approval"
import {
  AttentionProvider,
  type AttentionContext,
  type AttentionSelection,
} from "@zigil/agent-react/attention"
import { Button } from "@workspace/ui/components/button"
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  Alert,
  AlertAction,
  AlertDescription,
} from "@workspace/ui/components/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { DataLabel } from "@workspace/ui/components/data-label"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { PropertyPanel } from "@workspace/ui/components/blocks/property-panel"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { createBuiltinReducerRegistry } from "@workspace/graph/builtins"
import { DataKind } from "@workspace/graph/data-kinds"
import {
  materializeGraph,
  reduceGraphDocument,
  type ReducerGraphCommand,
  type ReducerGraphDocument,
  type ReducerGraphRun,
  type ReducerGraphSelection,
  type ReducerNodeDocument,
} from "@workspace/graph/document"
import type { Reducer } from "@workspace/graph/reducer"
import { cn } from "@workspace/ui/lib/utils"
import "@xyflow/react/dist/style.css"

type ReducerNodeData = Record<string, unknown> & {
  node: ReducerNodeDocument
  reducer: Reducer
  result?: Record<string, unknown>
  error?: string
}

type ReducerFlowNode = Node<ReducerNodeData, "reducer-node">

const registry = createBuiltinReducerRegistry()
const nodeTypes: NodeTypes = { "reducer-node": ReducerNode }

interface ReducerOption {
  value: string
  label: string
  description: string
}

const REDUCER_GROUPS = [...registry.categories()].map(([label, reducers]) => ({
  label,
  items: reducers.map((reducer) => ({
    value: reducer.id,
    label: reducer.name,
    description: reducer.description,
  })),
}))

const REDUCER_OPTIONS = REDUCER_GROUPS.flatMap((group) => group.items)

export function ReducerStudio() {
  const approvalMode = useToolApprovalMode()
  const documentQuery = useReducerGraph()
  const commandMutation = useReducerGraphCommand()
  const undoMutation = useReducerGraphUndo()
  const runQuery = useReducerGraphRun(documentQuery.data)
  const [selection, setSelection] = useState<ReducerGraphSelection | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [reducerId, setReducerId] = useState(registry.all()[0]?.id ?? "")
  const telemetry = useAttentionTelemetry({ historyLimit: 24 })
  const selectedReducerOption =
    REDUCER_OPTIONS.find((option) => option.value === reducerId) ?? null

  if (documentQuery.isPending) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Opening workspace…
      </div>
    )
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="grid h-full place-items-center text-sm text-destructive">
        {documentQuery.error?.message}
      </div>
    )
  }

  const document = documentQuery.data
  const selectedNode =
    selection?.kind === "node"
      ? document.nodes.find((node) => node.id === selection.id)
      : undefined
  const selectedEdge =
    selection?.kind === "edge"
      ? document.edges.find((edge) => edge.id === selection.id)
      : undefined

  const sendCommand = (command: ReducerGraphCommand) => {
    commandMutation.mutate(command)
    const activity = graphCommandActivity(command, document)
    telemetry.recordActivity(activity.action, activity.target, {
      summary: activity.summary,
    })
  }
  const updateSelection = (nextSelection: ReducerGraphSelection | null) => {
    setSelection(nextSelection)
    if (!nextSelection) return
    const target = graphSelectionAttention(nextSelection, document)
    telemetry.recordActivity("focus", target, {
      summary: `Focused ${target.label ?? target.id}`,
    })
  }
  const addNode = () => {
    const reducer = registry.get(reducerId)
    if (!reducer) return
    const id = uniqueNodeId(reducer.id, document)
    const node: ReducerNodeDocument = {
      id,
      reducerId: reducer.id,
      label: reducer.name,
      position: {
        x: 180 + document.nodes.length * 36,
        y: 120 + document.nodes.length * 28,
      },
      inputValues: Object.fromEntries(
        reducer.inputs
          .filter((input) => input.defaultValue !== undefined)
          .map((input) => [input.name, input.defaultValue]),
      ) as ReducerNodeDocument["inputValues"],
    }
    sendCommand({ type: "node.add", node })
    updateSelection({ kind: "node", id })
  }

  const attention: AttentionContext = {
    application: "sigil-chat",
    route: "/studio",
    workspace: {
      kind: "reducer-graph",
      id: document.id,
      revision: document.revision,
      label: document.title,
    },
    selection: selection
      ? graphSelectionAttention(selection, document)
      : undefined,
    selections: selection
      ? [graphSelectionAttention(selection, document)]
      : undefined,
    history: telemetry.history,
  }

  return (
    <AttentionProvider context={attention}>
      <div className="relative grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
        <div className="grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border px-2 py-1.5 sm:px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <Combobox
              items={REDUCER_GROUPS}
              onValueChange={(option: ReducerOption | null) => {
                if (option) setReducerId(option.value)
              }}
              value={selectedReducerOption}
            >
              <ComboboxInput
                aria-label="Reducer type"
                className="min-w-36 flex-1 sm:w-52"
                placeholder="Search reducers…"
              />
              <ComboboxContent className="w-80">
                <ComboboxEmpty>No reducers match.</ComboboxEmpty>
                <ComboboxList>
                  <ComboboxCollection>
                    {(group: { label: string; items: ReducerOption[] }) => (
                      <ComboboxGroup key={group.label} items={group.items}>
                        <ComboboxLabel>{group.label}</ComboboxLabel>
                        {group.items.map((option) => (
                          <ComboboxItem key={option.value} value={option}>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium">
                                {option.label}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {option.description}
                              </span>
                            </span>
                          </ComboboxItem>
                        ))}
                      </ComboboxGroup>
                    )}
                  </ComboboxCollection>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
            <Button onClick={addNode} size="sm" variant="secondary">
              <PlusIcon /> <span className="hidden sm:inline">Add node</span>
            </Button>
            <span className="hidden font-mono text-[10px] text-muted-foreground xl:inline">
              {document.nodes.length} nodes · {document.edges.length} edges ·
              rev {document.revision}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Button
              disabled={undoMutation.isPending}
              onClick={() => undoMutation.mutate()}
              size="sm"
              variant="ghost"
            >
              <Redo2Icon className="-scale-x-100" />{" "}
              <span className="hidden sm:inline">Undo</span>
            </Button>
            <Button
              disabled={runQuery.isFetching}
              onClick={() => {
                telemetry.recordActivity(
                  "execute",
                  {
                    kind: "reducer-graph",
                    id: document.id,
                    label: document.title,
                  },
                  { summary: "Ran the reducer graph" },
                )
                void runQuery.refetch()
              }}
              size="sm"
            >
              <PlayIcon /> {runQuery.isFetching ? "Running…" : "Run"}
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px]">
          <ReducerCanvas
            document={document}
            onCommand={sendCommand}
            onSelectionChange={updateSelection}
            run={runQuery.data}
            selection={selection}
          />
          <aside
            className={cn(
              "absolute inset-x-2 bottom-2 z-20 max-h-[55dvh] overflow-y-auto rounded-lg border border-border bg-card shadow-xl",
              "sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:max-h-none sm:w-[280px] sm:rounded-none sm:border-y-0 sm:border-r-0",
              "xl:static xl:min-h-0 xl:w-auto xl:shadow-none",
              (!selection || agentOpen) && "max-xl:hidden",
            )}
          >
            <Inspector
              document={document}
              onClose={() => setSelection(null)}
              onCommand={sendCommand}
              selectedEdgeId={selectedEdge?.id}
              selectedNode={selectedNode}
            />
          </aside>
        </div>

        <AgentHud.Root
          className="absolute bottom-4 right-4 z-30 xl:right-[276px] max-sm:inset-x-2 max-sm:bottom-2 max-sm:right-auto"
          onOpenChange={setAgentOpen}
          open={agentOpen}
        >
          <AgentHud.Trigger />
          <AgentHud.Panel
            actions={<AgentHud.Expand render={<Link to="/chat" />} />}
            chatProps={{
              approvalMode,
              onApprovalModeChange: setToolApprovalMode,
              placeholder: "Ask the agent, or tell it to use a Gonk tool…",
            }}
          />
        </AgentHud.Root>

        {commandMutation.isError ? (
          <Alert
            className="absolute bottom-4 left-1/2 z-40 w-auto max-w-[calc(100%-2rem)] -translate-x-1/2 shadow-lg"
            variant="destructive"
          >
            <CircleAlertIcon />
            <AlertDescription>{commandMutation.error.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </AttentionProvider>
  )
}

function ReducerCanvas({
  document,
  onCommand,
  onSelectionChange,
  run,
  selection,
}: {
  document: ReducerGraphDocument
  onCommand: (command: ReducerGraphCommand) => void
  onSelectionChange: (selection: ReducerGraphSelection | null) => void
  run?: ReducerGraphRun
  selection: ReducerGraphSelection | null
}) {
  const baseNodes = useMemo(
    () => projectNodes(document, run, selection),
    [document, run, selection],
  )
  // Only in-progress drag positions live in state. They're merged over the
  // derived nodes below; once a drag ends, node.move is sent and the
  // committed document (reflected in baseNodes) takes back over — there is
  // nothing left here to reconcile with an effect.
  const [dragPositions, setDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const nodes = useMemo(
    () =>
      Object.keys(dragPositions).length === 0
        ? baseNodes
        : baseNodes.map((node) =>
            dragPositions[node.id]
              ? { ...node, position: dragPositions[node.id] }
              : node,
          ),
    [baseNodes, dragPositions],
  )
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [editingEnabled, setEditingEnabled] = useState(true)
  const viewportGestureActive = useRef(false)

  const edges: Edge[] = document.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourceSocket,
    target: edge.targetNodeId,
    targetHandle: edge.targetSocket,
    type: "smoothstep",
    selected: selection?.kind === "edge" && selection.id === edge.id,
  }))

  const onNodesChange = (changes: NodeChange<ReducerFlowNode>[]) => {
    const positionChanges = changes.filter(
      (change): change is Extract<typeof change, { type: "position" }> =>
        change.type === "position" && change.position !== undefined,
    )
    if (positionChanges.length === 0) return
    setDragPositions((current) => {
      const next = { ...current }
      for (const change of positionChanges) next[change.id] = change.position!
      return next
    })
  }

  const onConnect = (connection: Connection) => {
    if (
      !connection.source ||
      !connection.target ||
      !connection.sourceHandle ||
      !connection.targetHandle
    )
      return
    const edge = {
      id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
      sourceNodeId: connection.source,
      sourceSocket: connection.sourceHandle,
      targetNodeId: connection.target,
      targetSocket: connection.targetHandle,
      ...connectionOrder(document, connection),
    }
    try {
      const next = reduceGraphDocument(document, { type: "edge.add", edge })
      materializeGraph(next, registry)
      setConnectionError(null)
      onCommand({ type: "edge.add", edge })
      onSelectionChange({ kind: "edge", id: edge.id })
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className="relative min-h-0 bg-muted/20">
      <ReactFlow<ReducerFlowNode>
        colorMode="dark"
        defaultViewport={document.viewport}
        deleteKeyCode={null}
        edges={edges}
        fitView={!document.viewport}
        fitViewOptions={{ padding: 0.25 }}
        maxZoom={2}
        minZoom={0.35}
        nodesConnectable={editingEnabled}
        nodesDraggable={editingEnabled}
        nodeTypes={nodeTypes}
        nodes={nodes}
        onConnect={onConnect}
        onEdgeClick={(_, edge) =>
          onSelectionChange({ kind: "edge", id: edge.id })
        }
        onMoveEnd={(_, viewport) => {
          if (!viewportGestureActive.current) return
          viewportGestureActive.current = false
          onCommand({ type: "viewport.update", viewport })
        }}
        onMoveStart={(event) => {
          viewportGestureActive.current = event !== null
        }}
        onNodeClick={(_, node) =>
          onSelectionChange({ kind: "node", id: node.id })
        }
        onNodeDragStop={(_, node) => {
          setDragPositions((current) => {
            if (!(node.id in current)) return current
            const next = { ...current }
            delete next[node.id]
            return next
          })
          onCommand({
            type: "node.move",
            id: node.id,
            position: node.position,
          })
        }}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelectionChange(null)}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          color="var(--color-border)"
          gap={24}
          size={1}
          variant={BackgroundVariant.Dots}
        />
        <MiniMap
          className="hidden rounded-md border border-border bg-background/85 sm:block"
          maskColor="color-mix(in srgb, var(--color-background) 75%, transparent)"
          nodeColor="var(--color-muted-foreground)"
          pannable
          position="top-right"
          style={{ height: 92, width: 140 }}
          zoomable
        />
        <StudioCanvasControls
          editingEnabled={editingEnabled}
          onEditingEnabledChange={setEditingEnabled}
        />
      </ReactFlow>
      <div className="pointer-events-none absolute left-3 top-3 hidden rounded-sm bg-background/75 px-2 py-1 font-mono text-[9px] text-muted-foreground backdrop-blur sm:block">
        Drag to arrange · connect output ports to compatible inputs · select
        anything to edit
      </div>
      {connectionError ? (
        <Alert
          className="absolute left-1/2 top-14 w-auto max-w-[calc(100%-2rem)] -translate-x-1/2 shadow-lg"
          variant="destructive"
        >
          <CircleAlertIcon />
          <AlertDescription>{connectionError}</AlertDescription>
          <AlertAction>
            <Button
              aria-label="Dismiss connection error"
              onClick={() => setConnectionError(null)}
              size="icon-xs"
              variant="ghost"
            >
              <XIcon />
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
    </div>
  )
}

function StudioCanvasControls({
  editingEnabled,
  onEditingEnabledChange,
}: {
  editingEnabled: boolean
  onEditingEnabledChange: (enabled: boolean) => void
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow<ReducerFlowNode>()

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
        <Separator className="mx-0.5 h-4!" orientation="vertical" />
        <CanvasControlButton
          active={!editingEnabled}
          label={editingEnabled ? "Lock graph editing" : "Unlock graph editing"}
          onClick={() => onEditingEnabledChange(!editingEnabled)}
        >
          {editingEnabled ? <LockIcon /> : <UnlockIcon />}
        </CanvasControlButton>
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

function ReducerNode({ data, selected }: NodeProps<ReducerFlowNode>) {
  return (
    <Card
      size="sm"
      {...getAgentTargetProps(`node:${data.node.id}`)}
      className={cn(
        "min-w-52 gap-0 py-0",
        selected ? "ring-2 ring-primary/50" : undefined,
        data.error ? "ring-1 ring-destructive" : undefined,
      )}
    >
      <CardHeader className="gap-0 border-b py-2">
        <CardTitle className="text-xs">{data.node.label}</CardTitle>
        <CardDescription className="font-mono text-[9px]">
          {data.reducer.id}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 py-2 font-mono text-[10px] text-muted-foreground">
        <div className="space-y-2">
          {data.reducer.inputs.map((input) => (
            <div
              className="relative flex items-baseline justify-between gap-2"
              key={input.name}
            >
              <Handle
                className={cn(
                  "size-2.5! border-2! border-background! bg-muted-foreground!",
                  input.multiple && "rounded-[2px]!",
                )}
                id={input.name}
                position={Position.Left}
                title={`${input.label ?? input.name}: ${input.accepts?.join(" | ") ?? input.kind}${input.multiple ? " (many)" : ""}`}
                type="target"
              />
              <span className="min-w-0 truncate">
                {input.label ?? input.name}
                {input.required ? <span aria-label="required"> *</span> : null}
              </span>
              <span className="shrink-0 text-[8px] opacity-65">
                {input.multiple ? "many" : input.kind}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2 text-right">
          {data.reducer.outputs.map((output) => (
            <div
              className="relative flex items-baseline justify-between gap-2"
              key={output.name}
            >
              <span className="min-w-0 truncate opacity-65">
                {output.label ?? output.name}
              </span>
              <span className="shrink-0 text-foreground">
                {formatValue(data.result?.[output.name]) ?? output.kind}
              </span>
              <Handle
                className={cn(
                  "size-2.5! border-2! border-background! bg-primary!",
                  output.multiple && "rounded-[2px]!",
                )}
                id={output.name}
                position={Position.Right}
                title={`${output.label ?? output.name}: ${output.kind}`}
                type="source"
              />
            </div>
          ))}
        </div>
      </CardContent>
      {data.error ? (
        <p className="border-t border-destructive/20 px-3 py-2 text-[10px] text-destructive">
          {data.error}
        </p>
      ) : null}
    </Card>
  )
}

function Inspector({
  document,
  onClose,
  onCommand,
  selectedEdgeId,
  selectedNode,
}: {
  document: ReducerGraphDocument
  onClose: () => void
  onCommand: (command: ReducerGraphCommand) => void
  selectedEdgeId?: string
  selectedNode?: ReducerNodeDocument
}) {
  if (selectedNode) {
    return (
      <NodeInspector
        document={document}
        key={`${selectedNode.id}:${selectedNode.label}:${JSON.stringify(selectedNode.inputValues)}`}
        node={selectedNode}
        onClose={onClose}
        onCommand={onCommand}
      />
    )
  }

  if (selectedEdgeId) {
    const edge = document.edges.find(
      (candidate) => candidate.id === selectedEdgeId,
    )
    return (
      <PropertyPanel.Root>
        <InspectorHeading onClose={onClose}>Properties</InspectorHeading>
        <p className="font-mono text-[9px] text-muted-foreground">
          {selectedEdgeId}
        </p>
        <PropertyPanel.Section title="Route">
          <div className="space-y-2">
            <DataLabel
              label="From"
              value={`${edge?.sourceNodeId}.${edge?.sourceSocket}`}
            />
            <DataLabel
              label="To"
              value={`${edge?.targetNodeId}.${edge?.targetSocket}`}
            />
          </div>
        </PropertyPanel.Section>
        <Separator />
        <Button
          onClick={() => onCommand({ type: "edge.remove", id: selectedEdgeId })}
          size="sm"
          variant="destructive"
        >
          <Trash2Icon /> Remove connection
        </Button>
      </PropertyPanel.Root>
    )
  }

  return (
    <PropertyPanel.Root>
      <InspectorHeading onClose={onClose}>Properties</InspectorHeading>
      <PropertyPanel.Section title="Graph">
        <PropertyPanel.Grid className="mt-1">
          <DataLabel label="Nodes" value={String(document.nodes.length)} />
          <DataLabel label="Edges" value={String(document.edges.length)} />
        </PropertyPanel.Grid>
      </PropertyPanel.Section>
      <Separator />
      <PropertyPanel.Section title="Selection">
        <p className="leading-relaxed text-muted-foreground">
          Select a node or connection to inspect it. Drag between typed ports to
          change the computation.
        </p>
      </PropertyPanel.Section>
      <p className="font-mono text-[9px] text-muted-foreground">
        Revision {document.revision}
      </p>
    </PropertyPanel.Root>
  )
}

function NodeInspector({
  document,
  node,
  onClose,
  onCommand,
}: {
  document: ReducerGraphDocument
  node: ReducerNodeDocument
  onClose: () => void
  onCommand: (command: ReducerGraphCommand) => void
}) {
  const reducer = registry.get(node.reducerId)
  const [label, setLabel] = useState(node.label)
  const [parseError, setParseError] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      (reducer?.inputs ?? []).map((input) => [
        input.name,
        serializeInputValue(
          node.inputValues[input.name] ?? input.defaultValue,
          input.kind,
        ),
      ]),
    ),
  )

  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    try {
      const inputValues = Object.fromEntries(
        (reducer?.inputs ?? []).flatMap((input) => {
          const value = values[input.name] ?? ""
          if (
            value.trim() === "" &&
            input.defaultValue === undefined &&
            input.kind !== DataKind.String
          ) {
            return []
          }
          return [[input.name, parseInputValue(value, input.kind)]]
        }),
      )
      setParseError(null)
      onCommand({
        type: "node.update",
        id: node.id,
        patch: { label: label.trim() || node.id, inputValues },
      })
    } catch (error) {
      setParseError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <form onSubmit={submit}>
      <PropertyPanel.Root>
        <InspectorHeading onClose={onClose}>Properties</InspectorHeading>
        <div>
          <p className="truncate text-xs font-medium">{node.label}</p>
          <p className="truncate font-mono text-[9px] text-muted-foreground">
            {node.id} · {node.reducerId}
          </p>
        </div>
        <PropertyPanel.Section title="Identity">
          <FieldGroup className="gap-2">
            <Field className="gap-1">
              <FieldLabel htmlFor={`label-${node.id}`}>Label</FieldLabel>
              <Input
                id={`label-${node.id}`}
                onChange={(event) => setLabel(event.target.value)}
                value={label}
              />
            </Field>
          </FieldGroup>
        </PropertyPanel.Section>
        <Separator />
        <PropertyPanel.Section title="Inputs">
          <div className="grid grid-cols-2 gap-2">
            {reducer?.inputs.map((input) => {
              const connection = document.edges.find(
                (edge) =>
                  edge.targetNodeId === node.id &&
                  edge.targetSocket === input.name,
              )
              return (
                <Field
                  className={cn(
                    "gap-1",
                    usesWideEditor(input.kind) && "col-span-2",
                  )}
                  key={input.name}
                >
                  <div className="flex items-center justify-between gap-2">
                    <FieldLabel htmlFor={`${node.id}-${input.name}`}>
                      {input.label ?? input.name}
                    </FieldLabel>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {connection ? "connected" : input.kind}
                    </span>
                  </div>
                  {connection ? (
                    <div className="flex h-7 items-center truncate rounded-md border border-border bg-muted/30 px-2 font-mono text-[9px] text-muted-foreground">
                      {connection.sourceNodeId}.{connection.sourceSocket}
                    </div>
                  ) : (
                    <>
                      <PortValueEditor
                        id={`${node.id}-${input.name}`}
                        kind={input.kind}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [input.name]: value,
                          }))
                        }
                        value={values[input.name] ?? ""}
                      />
                      {input.description ? (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {input.description}
                        </p>
                      ) : null}
                    </>
                  )}
                </Field>
              )
            })}
          </div>
        </PropertyPanel.Section>
        {parseError ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{parseError}</AlertDescription>
          </Alert>
        ) : null}
        <Separator />
        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={() => onCommand({ type: "node.remove", id: node.id })}
            size="sm"
            type="button"
            variant="destructive"
          >
            <Trash2Icon /> Remove
          </Button>
          <Button size="sm" type="submit">
            Apply changes
          </Button>
        </div>
      </PropertyPanel.Root>
    </form>
  )
}

function PortValueEditor({
  id,
  kind,
  onChange,
  value,
}: {
  id: string
  kind: DataKind
  onChange: (value: string) => void
  value: string
}) {
  if (kind === DataKind.Boolean) {
    return (
      <NativeSelect
        className="w-full"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <NativeSelectOption value="false">False</NativeSelectOption>
        <NativeSelectOption value="true">True</NativeSelectOption>
      </NativeSelect>
    )
  }

  if (
    kind === DataKind.NumberArray ||
    kind === DataKind.StringArray ||
    kind === DataKind.BooleanArray ||
    kind === DataKind.Dict ||
    kind === DataKind.DictArray ||
    kind === DataKind.Object ||
    kind === DataKind.ObjectArray ||
    kind === DataKind.Json ||
    kind === DataKind.Any
  ) {
    return (
      <Textarea
        className="min-h-16 font-mono text-xs"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    )
  }

  return (
    <Input
      id={id}
      inputMode={kind === DataKind.Number ? "decimal" : "text"}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  )
}

function usesWideEditor(kind: DataKind) {
  return kind !== DataKind.Number && kind !== DataKind.Boolean
}

function serializeInputValue(value: unknown, kind: DataKind): string {
  if (value === undefined) return ""
  if (kind === DataKind.String) return String(value)
  if (kind === DataKind.Number || kind === DataKind.Boolean) {
    return String(value)
  }
  return JSON.stringify(value, null, 2)
}

function parseInputValue(value: string, kind: DataKind) {
  switch (kind) {
    case DataKind.Number: {
      const number = Number(value)
      if (!Number.isFinite(number))
        throw new Error(`"${value}" is not a number.`)
      return number
    }
    case DataKind.Boolean:
      return value === "true"
    case DataKind.String:
      return value
    case DataKind.Any:
      if (value.trim() === "") return null
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    default:
      try {
        return JSON.parse(value)
      } catch {
        throw new Error("Structured port values must be valid JSON.")
      }
  }
}

function connectionOrder(
  document: ReducerGraphDocument,
  connection: Connection,
): { order?: number } {
  if (!connection.target || !connection.targetHandle) return {}
  const targetNode = document.nodes.find(({ id }) => id === connection.target)
  const targetReducer = targetNode
    ? registry.get(targetNode.reducerId)
    : undefined
  const targetPort = targetReducer?.inputs.find(
    ({ name }) => name === connection.targetHandle,
  )
  if (!targetPort?.multiple) return {}

  const existing = document.edges.filter(
    (edge) =>
      edge.targetNodeId === connection.target &&
      edge.targetSocket === connection.targetHandle,
  )
  return {
    order:
      Math.max(-1, ...existing.map((edge, index) => edge.order ?? index)) + 1,
  }
}

function InspectorHeading({
  children,
  onClose,
}: {
  children: string
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <SectionHeader>{children}</SectionHeader>
      <Button
        aria-label="Close inspector"
        className="xl:hidden"
        onClick={onClose}
        size="icon-xs"
        variant="ghost"
      >
        <XIcon />
      </Button>
    </div>
  )
}

function projectNodes(
  document: ReducerGraphDocument,
  run: ReducerGraphRun | undefined,
  selection: ReducerGraphSelection | null,
): ReducerFlowNode[] {
  return document.nodes.map((node) => {
    const reducer = registry.get(node.reducerId)
    if (!reducer)
      throw new Error(`Reducer "${node.reducerId}" is not registered.`)
    return {
      id: node.id,
      type: "reducer-node",
      position: node.position,
      selected: selection?.kind === "node" && selection.id === node.id,
      data: {
        node,
        reducer,
        result: run?.outputs[node.id],
        error: run?.errors[node.id],
      },
    }
  })
}

function graphSelectionAttention(
  selection: ReducerGraphSelection,
  document: ReducerGraphDocument,
): AttentionSelection {
  if (selection.kind === "node") {
    const node = document.nodes.find(
      (candidate) => candidate.id === selection.id,
    )
    return {
      kind: "reducer-node",
      id: selection.id,
      label: node?.label ?? selection.id,
      ...(node ? { detail: { reducerId: node.reducerId } } : {}),
    }
  }

  const edge = document.edges.find((candidate) => candidate.id === selection.id)
  return {
    kind: "reducer-edge",
    id: selection.id,
    ...(edge
      ? {
          detail: {
            source: `${edge.sourceNodeId}.${edge.sourceSocket}`,
            target: `${edge.targetNodeId}.${edge.targetSocket}`,
          },
        }
      : {}),
  }
}

function graphCommandActivity(
  command: ReducerGraphCommand,
  document: ReducerGraphDocument,
): {
  action: "edit" | "navigate"
  target: AttentionSelection
  summary: string
} {
  switch (command.type) {
    case "node.add":
      return {
        action: "edit",
        target: {
          kind: "reducer-node",
          id: command.node.id,
          label: command.node.label,
          detail: { reducerId: command.node.reducerId },
        },
        summary: `Added ${command.node.label}`,
      }
    case "node.update":
      return {
        action: "edit",
        target: graphSelectionAttention(
          { kind: "node", id: command.id },
          document,
        ),
        summary: `Updated node ${command.id}`,
      }
    case "node.move":
      return {
        action: "edit",
        target: graphSelectionAttention(
          { kind: "node", id: command.id },
          document,
        ),
        summary: `Moved node ${command.id}`,
      }
    case "node.remove":
      return {
        action: "edit",
        target: { kind: "reducer-node", id: command.id },
        summary: `Removed node ${command.id}`,
      }
    case "edge.add":
      return {
        action: "edit",
        target: {
          kind: "reducer-edge",
          id: command.edge.id,
          detail: {
            source: `${command.edge.sourceNodeId}.${command.edge.sourceSocket}`,
            target: `${command.edge.targetNodeId}.${command.edge.targetSocket}`,
          },
        },
        summary: `Connected ${command.edge.sourceNodeId} to ${command.edge.targetNodeId}`,
      }
    case "edge.remove":
      return {
        action: "edit",
        target: { kind: "reducer-edge", id: command.id },
        summary: `Removed connection ${command.id}`,
      }
    case "viewport.update":
      return {
        action: "navigate",
        target: {
          kind: "reducer-graph",
          id: document.id,
          label: document.title,
        },
        summary: "Changed graph viewport",
      }
  }
}

function uniqueNodeId(
  reducerId: string,
  document: ReducerGraphDocument,
): string {
  const stem = reducerId.replaceAll(".", "-")
  let index = 1
  while (document.nodes.some((node) => node.id === `${stem}-${index}`))
    index += 1
  return `${stem}-${index}`
}

function formatValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === "number")
    return Number.isInteger(value) ? String(value) : value.toFixed(2)
  const formatted =
    typeof value === "string" ? value : (JSON.stringify(value) ?? String(value))
  return formatted.length > 24 ? `${formatted.slice(0, 21)}…` : formatted
}
