import { useEffect, useState } from "react"
import { ValueScrubber } from "@workspace/ui/components/tweak/value-scrubber"
import { CompactSlider } from "@workspace/ui/components/tweak/compact-slider"
import { CompactXYPad } from "@workspace/ui/components/tweak/xy-pad"
import { Monitor } from "@workspace/ui/components/tweak/monitor"
import { Stepper } from "@workspace/ui/components/stepper"
import { PillBar, type PillItem } from "@workspace/ui/components/pill-bar"
import { Exhibit } from "@/components/showcase/exhibit"

// Tweak — abstract, compact controls for setting a single value by direct
// manipulation (drag, scrub, step). No hardware skeuomorphism (that's
// Instruments) and no bound/relationship modelling (that's Constraints) —
// just a flat control that turns a gesture into a number.

export function TweakShowcase() {
  const [scrubVal, setScrubVal] = useState(50)
  const [compactVal, setCompactVal] = useState(0.6)
  const [xyX, setXyX] = useState(0.5)
  const [xyY, setXyY] = useState(0.5)
  const [signal, setSignal] = useState(50)
  const [stepperValue, setStepperValue] = useState(4)
  const [channel, setChannel] = useState("mix")

  // Enough items to overflow the constrained width below so the edge fades
  // have something to fade against.
  const CHANNEL_ITEMS: PillItem[] = [
    { id: "mix", label: "Mix", badge: 12 },
    { id: "master", label: "Master", badge: 4 },
    { id: "drums", label: "Drums", badge: 8 },
    { id: "bass", label: "Bass", badge: 3 },
    { id: "lead", label: "Lead", badge: 6 },
    { id: "pad", label: "Pad", badge: 2 },
    { id: "fx", label: "FX", badge: 9 },
  ]

  // Live feed for the Monitor — a wandering signal pushed on an interval.
  useEffect(() => {
    let phase = 0
    const id = setInterval(() => {
      phase += 0.3
      setSignal(50 + 30 * Math.sin(phase) + 12 * Math.sin(phase * 2.7) + (Math.random() - 0.5) * 6)
    }, 250)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
      <Exhibit title="Value Scrubber" subtitle="drag to change" installName="value-scrubber">
        <div className="flex justify-center">
          <ValueScrubber label="Frequency" value={scrubVal} onChange={setScrubVal} min={20} max={2000} step={1} />
        </div>
      </Exhibit>

      <Exhibit title="Compact Slider" subtitle="fill-is-background" installName="compact-slider">
        <CompactSlider label="Mix" value={compactVal} onChange={setCompactVal} min={0} max={1} step={0.01} format={(v) => `${(v * 100).toFixed(0)}%`} />
      </Exhibit>

      <Exhibit title="XY Pad" subtitle="2D value picker" installName="xy-pad">
        <div className="flex justify-center">
          <CompactXYPad x={xyX} y={xyY} onChange={({ x, y }) => { setXyX(x); setXyY(y) }} size={80} />
        </div>
      </Exhibit>

      <Exhibit title="Stepper" subtitle="controlled −/value/+, arrow keys, disables at bounds" installName="stepper">
        <div className="flex items-center gap-4">
          <Stepper value={stepperValue} onChange={setStepperValue} min={0} max={16} format={(v) => `${v}`} />
          <span className="font-mono text-[10px] text-muted-foreground">min 0 · max 16 · arrows work when focused</span>
        </div>
      </Exhibit>

      <Exhibit title="Monitor" subtitle="live rolling sparkline · push a value, it scrolls" installName="monitor">
        <div className="flex justify-center">
          <Monitor value={signal} label="Throughput" unit="req/s" min={0} max={120} windowSize={40} />
        </div>
      </Exhibit>

      <Exhibit
        title="Pill Bar"
        subtitle="single-select · overflow scrolls + edge fades"
        installName="pill-bar"
        className="md:col-span-2 xl:col-span-3"
      >
        {/* Constrained width forces horizontal overflow so the mask fades
            appear on the side(s) with offscreen content. */}
        <div className="flex flex-col gap-2 py-1">
          <div className="max-w-[16rem]">
            <PillBar items={CHANNEL_ITEMS} selectedId={channel} onSelect={setChannel} />
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            selected: <span className="text-foreground">{channel}</span>
          </span>
        </div>
      </Exhibit>
    </div>
  )
}
