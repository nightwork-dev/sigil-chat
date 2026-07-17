"use client"

// Timeline.Inspector — the property inspector for one selected schedule node
// (TIMELINE-UI-AFFORDANCES.md §4.1–4.3, §5.1). Presentational and controlled:
// it imports no store and computes no derived windows. It reads the node and
// emits intent through onChange / onBoundsToggle / onRecurrenceChange; wiring
// to the store is a later story.
//
//   <TimelineInspector.Root node={node} siblings={siblings} ...>
//     <TimelineInspector.Anchor />
//     <TimelineInspector.Timing />
//     <TimelineInspector.Flexibility />
//     <TimelineInspector.Bounds />
//     <TimelineInspector.Repeats />
//   </TimelineInspector.Root>

import * as React from "react"
import { ChevronRightIcon, LockIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"
import { Label } from "@workspace/ui/components/label"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@workspace/ui/components/collapsible"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@workspace/ui/components/tooltip"
import type {
  Alignment,
  BoundsMode,
  Direction,
  DurationSpec,
  Frequency,
  Offset,
  Quantum,
  QuantumMode,
  RecurrenceRule,
  Schedule,
  VectorSchedule,
} from "@workspace/ui/lib/timeline/schedule/types"
import {
  anchorKindOf,
  DOW_LABELS,
  eligibleSiblingAnchors,
  fromBase,
  isBothEndConditions,
  naturalUnit,
  QUANTUM_MODES,
  QUANTUM_PRESETS,
  recurrenceSummary,
  setDurationField,
  setDurationQuantum,
  setOffsetField,
  setOffsetQuantum,
  TIME_UNITS,
  toBase,
  type AnchorKind,
  type BoundsToggle,
  type DurationField,
  type InspectorPatch,
  type OffsetField,
  type TimeUnit,
} from "./timeline-inspector-logic"

export type { InspectorPatch, BoundsToggle } from "./timeline-inspector-logic"

// ─── Context ────────────────────────────────────────────────────────────────

interface InspectorContextValue {
  node: Schedule
  siblings: Schedule[]
  parentBoundsMode: BoundsMode | null
  /** Current derived window for an auto node, so a toggle-to-fixed can freeze it. */
  derivedWindow?: { start: number; end: number | null }
  /** Renders the recurrence `until` scalar into the caller's calendar (§5.1). */
  formatValue: (value: number) => string
  onChange: (patch: InspectorPatch) => void
  onBoundsToggle: (toggle: BoundsToggle) => void
  onRecurrenceChange: (rule: RecurrenceRule | null) => void
}

const InspectorContext = React.createContext<InspectorContextValue | null>(null)

function useInspector() {
  const ctx = React.useContext(InspectorContext)
  if (!ctx) throw new Error("TimelineInspector parts must be used within <TimelineInspector.Root>")
  return ctx
}

/** Narrow to the vector view of the node, or null for absolute nodes. */
function useVectorNode(): VectorSchedule | null {
  const { node } = useInspector()
  return node.kind === "vector" ? node : null
}

export interface TimelineInspectorProps {
  node: Schedule
  siblings: Schedule[]
  parentBoundsMode: BoundsMode | null
  derivedWindow?: { start: number; end: number | null }
  formatValue?: (value: number) => string
  onChange: (patch: InspectorPatch) => void
  onBoundsToggle: (toggle: BoundsToggle) => void
  onRecurrenceChange: (rule: RecurrenceRule | null) => void
  className?: string
  children?: React.ReactNode
}

function Root({
  node,
  siblings,
  parentBoundsMode,
  derivedWindow,
  formatValue = String,
  onChange,
  onBoundsToggle,
  onRecurrenceChange,
  className,
  children,
}: TimelineInspectorProps) {
  return (
    <InspectorContext.Provider
      value={{ node, siblings, parentBoundsMode, derivedWindow, formatValue, onChange, onBoundsToggle, onRecurrenceChange }}
    >
      <TooltipProvider delay={0}>
        <div
          data-slot="timeline-inspector"
          className={cn("flex w-full flex-col gap-4 text-xs", className)}
        >
          {children}
        </div>
      </TooltipProvider>
    </InspectorContext.Provider>
  )
}

// ─── Shared primitives ──────────────────────────────────────────────────────

/** A field section with a label and its control(s). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
      {children}
    </div>
  )
}

interface SegmentOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
  disabledReason?: string
}

/**
 * A keyboard-accessible segmented control with radiogroup semantics: roving
 * tabindex, arrow keys move + select, Home/End jump. This is the a11y-critical
 * authoring surface the drag layer never had (§4).
 */
function Segmented<T extends string>({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[]
  value: T | null
  onValueChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  const enabled = options.filter((o) => !o.disabled)

  function focusAndSelect(target: HTMLElement | null, next: SegmentOption<T> | undefined) {
    if (!next) return
    onValueChange(next.value)
    const btn = target?.parentElement?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)
    btn?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const currentEnabledIdx = enabled.findIndex((o) => o.value === options[index].value)
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      focusAndSelect(e.currentTarget, enabled[(currentEnabledIdx + 1) % enabled.length])
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      focusAndSelect(e.currentTarget, enabled[(currentEnabledIdx - 1 + enabled.length) % enabled.length])
    } else if (e.key === "Home") {
      e.preventDefault()
      focusAndSelect(e.currentTarget, enabled[0])
    } else if (e.key === "End") {
      e.preventDefault()
      focusAndSelect(e.currentTarget, enabled[enabled.length - 1])
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-slot="inspector-segmented"
      className={cn("flex w-fit rounded-md border border-input bg-input/20 p-0.5", className)}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value
        const button = (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={opt.disabled || undefined}
            data-value={opt.value}
            tabIndex={selected || (value == null && i === 0) ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onValueChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "rounded-[min(var(--radius-md),6px)] px-2 py-1 text-[11px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              opt.disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground"
            )}
          >
            {opt.label}
          </button>
        )
        if (opt.disabled && opt.disabledReason) {
          return (
            <Tooltip key={opt.value}>
              <TooltipTrigger render={<span tabIndex={-1} />}>{button}</TooltipTrigger>
              <TooltipContent>{opt.disabledReason}</TooltipContent>
            </Tooltip>
          )
        }
        return button
      })}
    </div>
  )
}

/** A number input styled to match native-select, sharing its height/tokens. */
function NumberInput({
  value,
  onCommit,
  disabled,
  min,
  step,
  ariaLabel,
  className,
}: {
  value: number
  onCommit: (value: number) => void
  disabled?: boolean
  min?: number
  step?: number | "any"
  ariaLabel: string
  className?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={Number.isFinite(value) ? value : ""}
      min={min}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const n = e.target.valueAsNumber
        if (!Number.isNaN(n)) onCommit(n)
      }}
      className={cn(
        "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
        className
      )}
    />
  )
}

/** A base-value magnitude edited as (number × unit), storing back in base units. */
function ValueUnitField({
  base,
  onChange,
  disabled,
  ariaLabel,
}: {
  base: number
  onChange: (base: number) => void
  disabled?: boolean
  ariaLabel: string
}) {
  const [unit, setUnit] = React.useState<TimeUnit>(() => naturalUnit(base))
  const shown = fromBase(base, unit)
  return (
    <div className="flex items-center gap-1.5">
      <NumberInput
        value={shown}
        onCommit={(v) => onChange(toBase(v, unit))}
        disabled={disabled}
        min={0}
        step="any"
        ariaLabel={ariaLabel}
        className="flex-1"
      />
      <NativeSelect
        size="sm"
        aria-label={`${ariaLabel} unit`}
        value={unit}
        disabled={disabled}
        onChange={(e) => setUnit(e.target.value as TimeUnit)}
        className="shrink-0"
      >
        {TIME_UNITS.map((u) => (
          <NativeSelectOption key={u.value} value={u.value}>
            {u.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  )
}

// ─── Anchor + direction (§4.1) ──────────────────────────────────────────────

const ANCHOR_OPTIONS: { value: AnchorKind; label: string }[] = [
  { value: "start-parent", label: "Start of parent" },
  { value: "end-parent", label: "End of parent" },
  { value: "start-sibling", label: "Start of sibling" },
  { value: "end-sibling", label: "End of sibling" },
]

function Anchor() {
  const { parentBoundsMode, siblings, onChange } = useInspector()
  const vector = useVectorNode()
  if (!vector) return null

  const current = anchorKindOf(vector.alignment)
  const currentSiblingId =
    vector.alignment.kind === "startOf" || vector.alignment.kind === "endOf" ? vector.alignment.siblingId : null

  const eligible = eligibleSiblingAnchors(vector, siblings)
  const noSiblings = eligible.length === 0
  const autoParent = parentBoundsMode === "auto"

  function emitAnchor(kind: AnchorKind, siblingId?: string | null) {
    let alignment: Alignment
    switch (kind) {
      case "start-parent":
        alignment = { kind: "startOfParent" }
        break
      case "end-parent":
        alignment = { kind: "endOfParent" }
        break
      case "start-sibling":
        alignment = { kind: "startOf", siblingId: siblingId ?? eligible[0]?.id ?? "" }
        break
      case "end-sibling":
        alignment = { kind: "endOf", siblingId: siblingId ?? eligible[0]?.id ?? "" }
        break
    }
    onChange({ alignment })
  }

  const options: SegmentOption<AnchorKind>[] = ANCHOR_OPTIONS.map((o) => {
    if (o.value === "end-parent" && autoParent) {
      return { ...o, disabled: true, disabledReason: "An auto parent's end is derived from its children (core §2.3)" }
    }
    if ((o.value === "start-sibling" || o.value === "end-sibling") && noSiblings) {
      return { ...o, disabled: true, disabledReason: "No sibling can be anchored to without forming a cycle" }
    }
    return o
  })

  const showPicker = current === "start-sibling" || current === "end-sibling"

  return (
    <Section title="Anchor">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          ariaLabel="Anchor point"
          options={options}
          value={current}
          onValueChange={(k) => emitAnchor(k)}
          className="flex-wrap"
        />
        <DirectionToggle />
      </div>
      {showPicker && (
        <NativeSelect
          size="sm"
          aria-label="Sibling to anchor to"
          value={currentSiblingId ?? eligible[0]?.id ?? ""}
          onChange={(e) => emitAnchor(current, e.target.value)}
          className="mt-1 w-full"
        >
          {eligible.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {siblingLabel(s)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </Section>
  )
}

function siblingLabel(s: Schedule): string {
  const label = typeof s.payload?.data?.label === "string" ? s.payload.data.label : undefined
  return label ?? s.id
}

function DirectionToggle() {
  const { onChange } = useInspector()
  const vector = useVectorNode()
  if (!vector) return null
  const options: SegmentOption<Direction>[] = [
    { value: "before", label: "Before" },
    { value: "after", label: "After" },
  ]
  return (
    <Segmented
      ariaLabel="Offset direction"
      options={options}
      value={vector.offset.direction}
      onValueChange={(direction) => onChange({ offset: { ...vector.offset, direction } })}
    />
  )
}

// ─── Timing: offset + duration basis (§4.1) ─────────────────────────────────

function Timing() {
  const { onChange } = useInspector()
  const vector = useVectorNode()
  if (!vector) {
    return (
      <Section title="Timing">
        <p className="text-[11px] text-muted-foreground">
          Absolute node — its window is authored directly, not by offset.
        </p>
      </Section>
    )
  }
  const isEvent = vector.duration.basis === 0
  return (
    <Section title="Timing">
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <Label className="text-muted-foreground">Offset</Label>
        <ValueUnitField
          ariaLabel="Offset"
          base={vector.offset.basis}
          onChange={(basis) => onChange({ offset: setOffsetField(vector.offset, "basis", basis) })}
        />
        <Label className="text-muted-foreground">Duration</Label>
        <div>
          <ValueUnitField
            ariaLabel="Duration"
            base={vector.duration.basis}
            disabled={isEvent}
            onChange={(basis) => onChange({ duration: setDurationField(vector.duration, "basis", basis) })}
          />
          {isEvent && <p className="mt-1 text-[10px] text-muted-foreground">Event — instantaneous (duration 0)</p>}
        </div>
      </div>
    </Section>
  )
}

// ─── Flexibility (§4.2) ─────────────────────────────────────────────────────

function Flexibility() {
  const vector = useVectorNode()
  if (!vector) return null
  const isEvent = vector.duration.basis === 0
  return (
    <div className="flex flex-col gap-3">
      <ConstraintGroup kind="offset" />
      {!isEvent && <ConstraintGroup kind="duration" />}
    </div>
  )
}

function ConstraintGroup({ kind }: { kind: "offset" | "duration" }) {
  const { onChange } = useInspector()
  const vector = useVectorNode()
  const [open, setOpen] = React.useState(false)
  if (!vector) return null
  const v: VectorSchedule = vector

  const spec: Offset | DurationSpec = kind === "offset" ? v.offset : v.duration

  function emit(next: Offset | DurationSpec) {
    if (kind === "offset") onChange({ offset: next as Offset })
    else onChange({ duration: next as DurationSpec })
  }
  function setField(field: OffsetField | DurationField, value: number | undefined) {
    emit(
      kind === "offset"
        ? setOffsetField(v.offset, field as OffsetField, value)
        : setDurationField(v.duration, field as DurationField, value)
    )
  }
  function setQuantum(q: Quantum | undefined) {
    emit(kind === "offset" ? setOffsetQuantum(v.offset, q) : setDurationQuantum(v.duration, q))
  }

  const rigid = spec.flex === 0

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center gap-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:text-foreground"
        render={<button type="button" />}
      >
        <ChevronRightIcon className={cn("size-3 transition-transform", open && "rotate-90")} />
        {kind === "offset" ? "Offset flexibility" : "Duration flexibility"}
        {rigid && <LockIcon className="size-2.5" aria-label="rigid" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 pl-4">
          <Label className="text-muted-foreground">Min</Label>
          <OptionalValueField
            ariaLabel={`${kind} min`}
            base={spec.min}
            onChange={(v) => setField("min", v)}
          />
          <Label className="text-muted-foreground">Max</Label>
          <OptionalValueField
            ariaLabel={`${kind} max`}
            base={spec.max}
            onChange={(v) => setField("max", v)}
          />
          <Label className="text-muted-foreground">Flex</Label>
          <div className="flex items-center gap-1.5">
            <NumberInput
              ariaLabel={`${kind} flex weight`}
              value={spec.flex}
              min={0}
              step="any"
              onCommit={(v) => setField("flex", Math.max(0, v))}
              className="w-20"
            />
            {rigid && <LockIcon className="size-3 text-muted-foreground" aria-label="rigid (flex 0)" />}
          </div>
          <Label className="text-muted-foreground">Quantum</Label>
          <QuantumField quantum={spec.quantum} onChange={setQuantum} idPrefix={kind} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** An optional min/max: base value + unit, with a clear affordance. */
function OptionalValueField({
  base,
  onChange,
  ariaLabel,
}: {
  base: number | undefined
  onChange: (base: number | undefined) => void
  ariaLabel: string
}) {
  if (base === undefined) {
    return (
      <button
        type="button"
        onClick={() => onChange(0)}
        className="h-7 w-fit rounded-md border border-dashed border-input px-2 text-[11px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        + set {ariaLabel.split(" ").pop()}
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <ValueUnitField ariaLabel={ariaLabel} base={base} onChange={onChange} />
      <button
        type="button"
        aria-label={`clear ${ariaLabel}`}
        onClick={() => onChange(undefined)}
        className="shrink-0 rounded-sm px-1 text-[11px] text-muted-foreground outline-none hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        ✕
      </button>
    </div>
  )
}

function QuantumField({
  quantum,
  onChange,
  idPrefix,
}: {
  quantum: Quantum | undefined
  onChange: (quantum: Quantum | undefined) => void
  idPrefix: string
}) {
  const presetValue = quantum ? String(quantum.unit) : "none"
  const isCustom = quantum != null && !QUANTUM_PRESETS.some((p) => p.unit === quantum.unit)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <NativeSelect
        size="sm"
        aria-label={`${idPrefix} quantum grid`}
        value={isCustom ? "custom" : presetValue}
        onChange={(e) => {
          const v = e.target.value
          if (v === "none") onChange(undefined)
          else if (v === "custom") onChange({ unit: quantum?.unit ?? 1, mode: quantum?.mode ?? "nearest" })
          else onChange({ unit: Number(v), mode: quantum?.mode ?? "floor", origin: quantum?.origin })
        }}
      >
        <NativeSelectOption value="none">off</NativeSelectOption>
        {QUANTUM_PRESETS.map((p) => (
          <NativeSelectOption key={p.unit} value={String(p.unit)}>
            {p.label}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="custom">custom</NativeSelectOption>
      </NativeSelect>
      {isCustom && (
        <NumberInput
          ariaLabel={`${idPrefix} quantum unit (seconds)`}
          value={quantum.unit}
          min={1}
          step="any"
          onCommit={(v) => onChange({ ...quantum, unit: Math.max(1, v) })}
          className="w-20"
        />
      )}
      {quantum && (
        <NativeSelect
          size="sm"
          aria-label={`${idPrefix} quantum mode`}
          value={quantum.mode}
          onChange={(e) => onChange({ ...quantum, mode: e.target.value as QuantumMode })}
        >
          {QUANTUM_MODES.map((m) => (
            <NativeSelectOption key={m} value={m}>
              {m}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </div>
  )
}

// ─── Bounds mode (§4.3) ─────────────────────────────────────────────────────

function Bounds() {
  const { node, derivedWindow, onBoundsToggle } = useInspector()
  if (node.children.length === 0) return null

  const options: SegmentOption<BoundsMode>[] = [
    { value: "fixed", label: "Fixed" },
    { value: "auto", label: "Auto" },
  ]

  function onToggle(mode: BoundsMode) {
    if (mode === node.boundsMode) return
    // auto → fixed freezes the current derived window (§4.3); fixed → auto has
    // nothing to freeze. We emit intent; the consumer computes/applies.
    const frozenWindow = mode === "fixed" && node.boundsMode === "auto" ? (derivedWindow ?? null) : null
    onBoundsToggle({ mode, frozenWindow })
  }

  return (
    <Section title="Bounds">
      <Segmented ariaLabel="Bounds mode" options={options} value={node.boundsMode} onValueChange={onToggle} />
      <p className="text-[10px] text-muted-foreground">
        {node.boundsMode === "auto"
          ? "Window derived from children. Switching to Fixed freezes the current window."
          : "Window authored. Children are bounded by it."}
      </p>
    </Section>
  )
}

// ─── Repeats: recurrence editor (§5.1) ──────────────────────────────────────

const FREQUENCIES: Frequency[] = ["hourly", "daily", "weekly", "monthly", "custom"]

const DEFAULT_RULE: RecurrenceRule = { frequency: "weekly", interval: 1 }

function Repeats() {
  const { node, formatValue, onRecurrenceChange } = useInspector()
  const rule = node.recurrence ?? null
  const enabled = rule != null

  return (
    <Section title="Repeats">
      <label className="flex items-center gap-2 text-[11px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onRecurrenceChange(e.target.checked ? DEFAULT_RULE : null)}
          className="size-3.5 accent-primary"
        />
        Repeats
      </label>
      {rule && <RecurrenceEditor rule={rule} formatValue={formatValue} onChange={onRecurrenceChange} />}
    </Section>
  )
}

function RecurrenceEditor({
  rule,
  formatValue,
  onChange,
}: {
  rule: RecurrenceRule
  formatValue: (value: number) => string
  onChange: (rule: RecurrenceRule) => void
}) {
  const showDow = rule.frequency === "daily" || rule.frequency === "weekly"
  const showDom = rule.frequency === "monthly"
  const both = isBothEndConditions(rule)

  return (
    <div className="mt-1 flex flex-col gap-3 border-l border-border pl-3">
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
        <Label className="text-muted-foreground">Frequency</Label>
        <NativeSelect
          size="sm"
          aria-label="Recurrence frequency"
          value={rule.frequency}
          onChange={(e) => onChange({ ...rule, frequency: e.target.value as Frequency })}
        >
          {FREQUENCIES.map((f) => (
            <NativeSelectOption key={f} value={f}>
              {f}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Label className="text-muted-foreground">Every</Label>
        <NumberInput
          ariaLabel="Recurrence interval"
          value={rule.interval ?? 1}
          min={1}
          step={1}
          onCommit={(v) => onChange({ ...rule, interval: Math.max(1, Math.round(v)) })}
          className="w-20"
        />
      </div>

      {showDow && <DayOfWeekChips rule={rule} onChange={onChange} />}
      {showDom && <DayOfMonthPicker rule={rule} onChange={onChange} />}

      <EndCondition rule={rule} both={both} onChange={onChange} />

      <p className="text-[11px] text-primary" role="status">
        {recurrenceSummary(rule, formatValue)}
      </p>
    </div>
  )
}

function DayOfWeekChips({ rule, onChange }: { rule: RecurrenceRule; onChange: (rule: RecurrenceRule) => void }) {
  const selected = new Set(rule.daysOfWeek ?? [])
  function toggle(d: number) {
    const next = new Set(selected)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    const arr = [...next].sort((a, b) => a - b)
    onChange({ ...rule, daysOfWeek: arr.length ? arr : undefined })
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">Days of week</span>
      <div className="flex gap-1">
        {DOW_LABELS.map((label, d) => {
          const on = selected.has(d)
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={label}
              onClick={() => toggle(d)}
              className={cn(
                "size-6 rounded-sm border text-[10px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-input/20 text-muted-foreground hover:text-foreground"
              )}
            >
              {label[0]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayOfMonthPicker({ rule, onChange }: { rule: RecurrenceRule; onChange: (rule: RecurrenceRule) => void }) {
  const selected = new Set(rule.daysOfMonth ?? [])
  function toggle(d: number) {
    const next = new Set(selected)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    const arr = [...next].sort((a, b) => a - b)
    onChange({ ...rule, daysOfMonth: arr.length ? arr : undefined })
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground">Days of month</span>
      {/* design-lint-ignore bare-grid — 7-col calendar (days of month); 7 is semantic, not a responsive layout */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
          const on = selected.has(d)
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={`Day ${d}`}
              onClick={() => toggle(d)}
              className={cn(
                "flex h-6 items-center justify-center rounded-sm border text-[10px] tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-input/20 text-muted-foreground hover:text-foreground"
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type EndKind = "never" | "count" | "until"

function EndCondition({
  rule,
  both,
  onChange,
}: {
  rule: RecurrenceRule
  both: boolean
  onChange: (rule: RecurrenceRule) => void
}) {
  const activeKind: EndKind = rule.count != null ? "count" : rule.until != null ? "until" : "never"

  function select(kind: EndKind) {
    if (kind === "never") onChange({ ...rule, count: undefined, until: undefined })
    // Selecting a radio option explicitly clears the other (§5.1).
    else if (kind === "count") onChange({ ...rule, count: rule.count ?? 1, until: undefined })
    else onChange({ ...rule, until: rule.until ?? 0, count: undefined })
  }

  // Both count and until set: show both with a "first of:" label instead of the
  // radio; editing either keeps both (§5.1).
  if (both) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] text-muted-foreground">Ends — first of:</span>
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <Label className="text-muted-foreground">After</Label>
          <div className="flex items-center gap-1.5">
            <NumberInput
              ariaLabel="Occurrence count"
              value={rule.count ?? 0}
              min={1}
              step={1}
              onCommit={(v) => onChange({ ...rule, count: Math.max(1, Math.round(v)) })}
              className="w-20"
            />
            <span className="text-[10px] text-muted-foreground">occurrences</span>
            <button
              type="button"
              onClick={() => select("until")}
              className="rounded-sm px-1 text-[10px] text-muted-foreground hover:text-destructive"
            >
              drop
            </button>
          </div>
          <Label className="text-muted-foreground">On date</Label>
          <div className="flex items-center gap-1.5">
            <NumberInput
              ariaLabel="End value"
              value={rule.until ?? 0}
              step="any"
              onCommit={(v) => onChange({ ...rule, until: v })}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => select("count")}
              className="rounded-sm px-1 text-[10px] text-muted-foreground hover:text-destructive"
            >
              drop
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] text-muted-foreground">Ends</span>
      <div role="radiogroup" aria-label="End condition" className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="radio"
            name="end-condition"
            checked={activeKind === "never"}
            onChange={() => select("never")}
            className="accent-primary"
          />
          Never
        </label>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="radio"
            name="end-condition"
            checked={activeKind === "count"}
            onChange={() => select("count")}
            className="accent-primary"
          />
          After
          <NumberInput
            ariaLabel="Occurrence count"
            value={rule.count ?? 1}
            min={1}
            step={1}
            disabled={activeKind !== "count"}
            onCommit={(v) => onChange({ ...rule, count: Math.max(1, Math.round(v)), until: undefined })}
            className="w-16"
          />
          occurrences
        </label>
        <label className="flex items-center gap-2 text-[11px]">
          <input
            type="radio"
            name="end-condition"
            checked={activeKind === "until"}
            onChange={() => select("until")}
            className="accent-primary"
          />
          On
          <NumberInput
            ariaLabel="End value"
            value={rule.until ?? 0}
            step="any"
            disabled={activeKind !== "until"}
            onCommit={(v) => onChange({ ...rule, until: v, count: undefined })}
            className="w-28"
          />
        </label>
      </div>
    </div>
  )
}

// ─── Compound export ────────────────────────────────────────────────────────

export const TimelineInspector = { Root, Anchor, Timing, Flexibility, Bounds, Repeats }
