import { useEffect, useState } from "react"
import { Oscilloscope } from "@workspace/ui/components/display/oscilloscope"
import { Readout } from "@workspace/ui/components/display/readout"
import { Exhibit } from "@/components/showcase/exhibit"

export function DisplaysShowcase() {
  const [nixieValue, setNixieValue] = useState(42)
  const [oscData, setOscData] = useState<number[]>(() =>
    Array.from({ length: 128 }, (_, i) => 0.5 + 0.4 * Math.sin((i / 128) * Math.PI * 4))
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setNixieValue((v) => (v + 1 > 9999 ? 0 : v + 1))
    }, 150)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let frame: number
    let phase = 0
    function animate() {
      phase += 0.05
      setOscData(
        Array.from({ length: 128 }, (_, i) =>
          0.5 + 0.35 * Math.sin((i / 128) * Math.PI * 4 + phase) + 0.1 * Math.sin((i / 128) * Math.PI * 12 + phase * 2)
        )
      )
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Every digital readout below is one component — <Readout variant="…" /> —
  // differing only in rendering aesthetic. Each exhibit installs `readout`.
  return (
    <div className="space-y-4 p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="LCD Display" subtitle="backlit character grid · theme-tracking by default, try switching themes" installName="readout">
          <div className="flex flex-col items-center gap-3">
            <Readout variant="lcd" value="SIGIL DESIGN" columns={16} rows={2} />
            <Readout variant="lcd" value="READY" columns={8} rows={1} glow="green" />
          </div>
        </Exhibit>

        <Exhibit title="Nixie Tubes" subtitle="warm glow · digit display" installName="readout">
          <div className="flex flex-col items-center gap-3">
            <Readout variant="nixie" value={String(nixieValue).padStart(4, "0")} size={48} />
          </div>
        </Exhibit>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="LED Segment" subtitle="seven segment · high contrast" installName="readout">
          <div className="flex justify-center">
            <Readout variant="segment" value={String(nixieValue).padStart(4, " ")} columns={4} digitHeight={40} />
          </div>
        </Exhibit>

        <Exhibit title="Oscilloscope" subtitle="CRT · phosphor trace · theme-tracking by default" installName="oscilloscope">
          <div className="flex justify-center">
            <Oscilloscope data={oscData} width={280} height={140} showGrid />
          </div>
        </Exhibit>
      </div>

      <Exhibit title="VFD" subtitle="vacuum-fluorescent · blue-green phosphor glow · info-token themed" installName="readout">
        <div className="flex flex-col items-center gap-3">
          <Readout variant="vfd" value={`TRACK ${String(nixieValue % 100).padStart(2, "0")}`} columns={12} label="Now Playing" fontSize={22} />
          <Readout variant="vfd" value={String(nixieValue).padStart(6, "0")} columns={6} label="Counter" />
        </div>
      </Exhibit>
    </div>
  )
}
