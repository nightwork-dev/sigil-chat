import { useState } from "react"
import { Knob } from "@workspace/ui/components/instrument/knob"
import { Fader } from "@workspace/ui/components/instrument/fader"
import { LED } from "@workspace/ui/components/instrument/led"
import { ToggleSwitch } from "@workspace/ui/components/instrument/toggle-switch"
import { Gauge } from "@workspace/ui/components/instrument/gauge"
import { RotarySwitch } from "@workspace/ui/components/instrument/rotary-switch"
import { Exhibit } from "@/components/showcase/exhibit"

export function InstrumentsShowcase() {
  const [knobA, setKnobA] = useState(0.5)
  const [knobB, setKnobB] = useState(0.25)
  const [knobC, setKnobC] = useState(0.8)
  const [faderA, setFaderA] = useState(0.7)
  const [faderB, setFaderB] = useState(0.4)
  const [toggleA, setToggleA] = useState(false)
  const [toggleB, setToggleB] = useState(true)
  const [mode, setMode] = useState("sine")
  const [range, setRange] = useState("1k")
  const [knobDetentShow, setKnobDetentShow] = useState(0.6)
  const [knobDetentSnap, setKnobDetentSnap] = useState(0.5)
  // Gauge is a display-only component — no onChange to wire.
  const gaugeA = 0.4
  const gaugeB = 0.72

  return (
    <div className="space-y-4 p-6">
      <Exhibit title="Channel Strip" subtitle="knob + fader + LED + toggle">
        <div className="flex items-end justify-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <Knob label="Pan" value={knobA} onChange={setKnobA} size={36} />
            <Fader label="Vol" value={faderA} onChange={setFaderA} />
            <div className="flex gap-2">
              <LED color="hsl(var(--primary))" size={6} />
              <LED color="#ef4444" isOn={faderA > 0.8} pulsing size={6} label="CLIP" />
            </div>
            <ToggleSwitch isOn={toggleA} onToggle={setToggleA} label="MUTE" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <Knob label="Pan" value={knobB} onChange={setKnobB} size={36} />
            <Fader label="Vol" value={faderB} onChange={setFaderB} />
            <div className="flex gap-2">
              <LED color="hsl(var(--primary))" size={6} />
              <LED color="#ef4444" isOn={faderB > 0.8} pulsing size={6} label="CLIP" />
            </div>
            <ToggleSwitch isOn={toggleB} onToggle={setToggleB} label="MUTE" />
          </div>
        </div>
      </Exhibit>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="Knobs" subtitle="rotary · drag vertical" installName="knob">
          <div className="flex items-center justify-center gap-5">
            <Knob label="Filter" value={knobA} onChange={setKnobA} size={32} />
            <Knob label="Cutoff" value={knobB} onChange={setKnobB} size={48} />
            <Knob label="Gain" value={knobC} onChange={setKnobC} size={64} />
          </div>
        </Exhibit>

        <Exhibit title="Gauges" subtitle="analog dial · needle" installName="gauge">
          <div className="flex items-center justify-center gap-5">
            <Gauge value={gaugeA} label="Level" size={100} />
            <Gauge value={gaugeB} label="Temp" size={100} tint="#f59e0b" displayRange={[0, 120]} precision={1} />
          </div>
        </Exhibit>
      </div>

      <Exhibit
        title="Knob Detents"
        subtitle="quantized-detent display · continuous shown vs. snapped"
        installName="knob"
      >
        <div className="flex items-center justify-center gap-8">
          <Knob
            label="Detents (show)"
            value={knobDetentShow}
            onChange={setKnobDetentShow}
            size={56}
            detents={5}
          />
          <Knob
            label="Detents (snap)"
            value={knobDetentSnap}
            onChange={setKnobDetentSnap}
            size={56}
            detents={5}
            snap
          />
        </div>
      </Exhibit>

      <Exhibit title="Rotary Switch" subtitle="discrete detents · drag, click a tick, or arrow keys" installName="rotary-switch">
        <div className="flex items-center justify-center gap-8">
          <RotarySwitch
            label="Waveform"
            value={mode}
            onChange={setMode}
            options={[
              { value: "sine", label: "SINE" },
              { value: "tri", label: "TRI" },
              { value: "saw", label: "SAW" },
              { value: "square", label: "SQR" },
              { value: "noise", label: "NOISE" },
            ]}
            size={64}
          />
          <RotarySwitch
            label="Range"
            value={range}
            onChange={setRange}
            options={["10", "100", "1k", "10k"]}
            size={56}
          />
        </div>
      </Exhibit>
    </div>
  )
}
