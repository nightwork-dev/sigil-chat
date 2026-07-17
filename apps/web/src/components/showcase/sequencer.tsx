import { useEffect, useState } from "react"
import { Sequencer } from "@workspace/ui/components/sequencer/sequencer"
import { EnvelopeEditor } from "@workspace/ui/components/sequencer/envelope-editor"
import { SpectrumAnalyzer } from "@workspace/ui/components/sequencer/spectrum-analyzer"
import { WaveformDisplay } from "@workspace/ui/components/sequencer/waveform-display"
import { PatchBay, type PatchConnection } from "@workspace/ui/components/sequencer/patch-bay"
import { Marquee } from "@workspace/ui/components/sequencer/marquee"
import { Exhibit } from "@/components/showcase/exhibit"

export function SequencerShowcase() {
  const [seqPattern, setSeqPattern] = useState<boolean[][]>(() => {
    const p = Array.from({ length: 4 }, () => Array(16).fill(false))
    for (let i = 0; i < 16; i += 4) p[0][i] = true
    p[1][4] = true
    p[1][12] = true
    for (let i = 0; i < 16; i += 2) p[2][i] = true
    p[3][2] = true
    p[3][6] = true
    p[3][9] = true
    p[3][14] = true
    return p
  })
  const [seqStep, setSeqStep] = useState(0)
  const [envA, setEnvA] = useState(0.15)
  const [envD, setEnvD] = useState(0.25)
  const [envS, setEnvS] = useState(0.65)
  const [envR, setEnvR] = useState(0.35)
  const [specBands, setSpecBands] = useState<number[]>(() => Array.from({ length: 24 }, () => Math.random() * 0.8))
  const [waveSamples] = useState<number[]>(() =>
    Array.from({ length: 512 }, (_, i) => {
      const t = i / 512
      return Math.sin(t * Math.PI * 2 * 4) * 0.7 + Math.sin(t * Math.PI * 2 * 12) * 0.2
    })
  )
  const [wavePos, setWavePos] = useState(0)
  const [patchConnections, setPatchConnections] = useState<PatchConnection[]>([
    { input: 0, output: 0 },
    { input: 1, output: 1 },
    { input: 2, output: 2 },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setSeqStep((s) => (s + 1) % 16)
      setSpecBands((prev) => prev.map((v) => Math.max(0, Math.min(1, v * 0.7 + Math.random() * 0.3 * 0.95))))
      setWavePos((p) => (p + 0.005 > 1 ? 0 : p + 0.005))
    }, 150)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="space-y-4 p-6">
      <Exhibit title="Marquee" subtitle="scrolling ticker" installName="marquee">
        <Marquee
          text="SIGIL DESIGN SYSTEM — INSTRUMENT CONTROLS — DISPLAY TYPES — SEQUENCER — CREATIVE TOOLS"
          speed={40}
          color="hsl(var(--primary))"
          height={28}
        />
      </Exhibit>

      <Exhibit title="Step Sequencer" subtitle="16-step · 4-channel drum machine" installName="sequencer">
        <Sequencer
          steps={16}
          channels={4}
          pattern={seqPattern}
          onPatternChange={setSeqPattern}
          channelColors={["hsl(var(--primary))", "#f59e0b", "#22c55e", "#ef4444"]}
          currentStep={seqStep}
          cellSize={18}
        />
      </Exhibit>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="Envelope" subtitle="ADSR · draggable" installName="envelope-editor">
          <div className="flex justify-center">
            <EnvelopeEditor
              attack={envA} onAttackChange={setEnvA}
              decay={envD} onDecayChange={setEnvD}
              sustain={envS} onSustainChange={setEnvS}
              release={envR} onReleaseChange={setEnvR}
              size={{ width: 280, height: 140 }}
            />
          </div>
        </Exhibit>

        <Exhibit title="Spectrum" subtitle="frequency bands · peak hold" installName="spectrum-analyzer">
          <div className="flex justify-center">
            <SpectrumAnalyzer bands={specBands} bandCount={24} size={{ width: 280, height: 120 }} gradient />
          </div>
        </Exhibit>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exhibit title="Waveform" subtitle="audio · symmetric · zoom" installName="waveform-display">
          <div className="flex justify-center">
            <WaveformDisplay samples={waveSamples} playbackPosition={wavePos} filled size={{ width: 280, height: 100 }} />
          </div>
        </Exhibit>

        <Exhibit title="Patch Bay" subtitle="connection matrix" installName="patch-bay">
          <div className="flex justify-center">
            <PatchBay
              inputs={["OSC1", "OSC2", "LFO", "NOISE"]}
              outputs={["VCA", "VCF", "ENV", "MIX"]}
              connections={patchConnections}
              onConnectionsChange={setPatchConnections}
              cellSize={32}
            />
          </div>
        </Exhibit>
      </div>
    </div>
  )
}
