import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CameraIcon,
  CopyIcon,
  CrosshairIcon,
  EyeIcon,
  EyeOffIcon,
  InfoIcon,
  RotateCcwIcon,
  SquareIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import {
  createCalibrationTargets,
  leaveOneTargetOutResiduals,
  summarizeCalibrationTarget,
  type CalibrationSample,
  type CalibrationDiagnostics,
  type NormalizedCalibrationTarget,
  type ScreenPoint,
} from "./calibration"
import { LocalCorrectionField } from "./corrections"
import {
  createGazeEstimator,
  type GazeConfidence,
  type GazeEstimator,
} from "./estimator"
import { FixationSettler } from "./fixation"
import { OneEuroFilter, type OneEuroOptions } from "./one-euro"
import {
  fitPoseCalibrationLayer,
  predictLayeredGaze,
  upsertPoseCalibrationLayer,
  type PoseCalibrationLayer,
  type PoseCoverage,
} from "./pose-calibration"
import {
  advanceProtocol,
  createIdleProtocolState,
  currentProtocolTarget,
  PROTOCOL_DRIFT_WAIT_MS,
  recommendProtocol,
  startProtocol,
  type ProtocolState,
} from "./protocol"
import {
  grid3x3Regions,
  HysteresisQuantizer,
  panelRegions,
  type RegionEvent,
} from "./regions"

type LabPhase =
  | "off"
  | "starting"
  | "ready"
  | "calibrating"
  | "tracking"
  | "error"

interface CalibrationProgress {
  targetIndex: number
  collected: number
  settling: boolean
}

interface ObservationFields {
  lighting: string
  glasses: string
  indicatorPreference: "cursor" | "region-glow" | "both"
  failureModes: string
}

type TeachStatus = "idle" | "settling" | "collecting" | "learned"
type CalibrationMode = "replace" | "add"

const CALIBRATION_FRAMES = 24
const TEACH_FRAMES = 18
const FRAME_INTERVAL_MS = 1000 / 30
const TUNING_CONTROLS: Array<{
  key: keyof OneEuroOptions
  min: number
  max: number
  step: number
  help: string
}> = [
  {
    key: "minCutoff",
    min: 0.1,
    max: 5,
    step: 0.1,
    help: "Baseline responsiveness. Lower values make a steadier but slower cursor; higher values follow small movements faster but show more jitter.",
  },
  {
    key: "beta",
    min: 0,
    max: 0.1,
    step: 0.001,
    help: "How much smoothing relaxes during fast gaze changes. Raise it if large movements lag; lower it if quick movements overshoot or feel twitchy.",
  },
  {
    key: "dCutoff",
    min: 0.1,
    max: 5,
    step: 0.1,
    help: "Smoothing applied to the estimated movement speed. Usually leave this near 1; lowering it makes the filter slower to react to changes in speed.",
  },
]

function clampPoint(point: ScreenPoint): ScreenPoint {
  return {
    x: Math.max(0, Math.min(window.innerWidth, point.x)),
    y: Math.max(0, Math.min(window.innerHeight, point.y)),
  }
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

function panelGlow(active: boolean, enabled: boolean, confident: boolean) {
  return active && enabled
    ? confident
      ? "border-cyan-400/70 bg-cyan-400/[0.08] shadow-[inset_0_0_48px_rgba(34,211,238,0.08)]"
      : "border-cyan-400/25 bg-cyan-400/[0.025]"
    : "border-border/50 bg-background/30"
}

function HelpLabel({ children, help }: { children: string; help: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              className="inline-grid size-4 place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={`Help: ${children}`}
            />
          }
        >
          <InfoIcon className="size-3" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-64 leading-relaxed">
          {help}
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

export function GazeLab() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const estimatorRef = useRef<GazeEstimator | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef(0)
  const trackingStartedAtRef = useRef(0)
  const calibrationLayersRef = useRef<PoseCalibrationLayer[]>([])
  const calibrationModeRef = useRef<CalibrationMode>("replace")
  const calibrationSamplesRef = useRef<CalibrationSample[]>([])
  const calibrationTargetsRef = useRef<NormalizedCalibrationTarget[]>([])
  const calibrationTargetIndexRef = useRef(0)
  const calibrationTargetFramesRef = useRef(0)
  const calibrationSettlerRef = useRef(new FixationSettler())
  const correctionFieldRef = useRef(new LocalCorrectionField())
  const pointerRef = useRef<ScreenPoint | null>(null)
  const teachActiveRef = useRef(false)
  const teachTargetRef = useRef<ScreenPoint | null>(null)
  const teachSamplesRef = useRef<CalibrationSample[]>([])
  const teachSettlerRef = useRef(new FixationSettler())
  const xFilterRef = useRef(new OneEuroFilter())
  const yFilterRef = useRef(new OneEuroFilter())
  const gridQuantizerRef = useRef(new HysteresisQuantizer())
  const panelQuantizerRef = useRef(new HysteresisQuantizer())
  const protocolRef = useRef<ProtocolState>(createIdleProtocolState())

  const [phase, setPhase] = useState<LabPhase>("off")
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<GazeConfidence>("low")
  const [confidenceReason, setConfidenceReason] = useState("Camera is off")
  const [point, setPoint] = useState<ScreenPoint | null>(null)
  const [activeGridRegion, setActiveGridRegion] = useState<string | null>(null)
  const [activePanelRegion, setActivePanelRegion] = useState<string | null>(
    null,
  )
  const [events, setEvents] = useState<RegionEvent[]>([])
  const [calibrationProgress, setCalibrationProgress] =
    useState<CalibrationProgress | null>(null)
  const [calibrationResiduals, setCalibrationResiduals] = useState<number[]>([])
  const [calibrationDiagnostics, setCalibrationDiagnostics] =
    useState<CalibrationDiagnostics | null>(null)
  const [calibrationLayers, setCalibrationLayers] = useState<
    PoseCalibrationLayer[]
  >([])
  const [calibrationMode, setCalibrationMode] =
    useState<CalibrationMode>("replace")
  const [poseCoverage, setPoseCoverage] = useState<{
    coverage: PoseCoverage
    nearestDistance: number
  } | null>(null)
  const [teachStatus, setTeachStatus] = useState<TeachStatus>("idle")
  const [teachTarget, setTeachTarget] = useState<ScreenPoint | null>(null)
  const [teachCollected, setTeachCollected] = useState(0)
  const [correctionCount, setCorrectionCount] = useState(0)
  const [showCursor, setShowCursor] = useState(true)
  const [showRegionGlow, setShowRegionGlow] = useState(true)
  const [filterOptions, setFilterOptions] = useState<OneEuroOptions>({
    minCutoff: 1,
    beta: 0.007,
    dCutoff: 1,
  })
  const [protocol, setProtocol] = useState<ProtocolState>(() =>
    createIdleProtocolState(),
  )
  const [trackingUptimeMs, setTrackingUptimeMs] = useState(0)
  const [observations, setObservations] = useState<ObservationFields>({
    lighting: "",
    glasses: "not tested",
    indicatorPreference: "both",
    failureModes: "",
  })

  const releaseCamera = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    estimatorRef.current?.close()
    estimatorRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const resetTrackingState = useCallback(() => {
    calibrationLayersRef.current = []
    calibrationSamplesRef.current = []
    calibrationTargetsRef.current = []
    calibrationSettlerRef.current.reset()
    correctionFieldRef.current.clear()
    teachActiveRef.current = false
    teachTargetRef.current = null
    teachSamplesRef.current = []
    teachSettlerRef.current.reset()
    xFilterRef.current.reset()
    yFilterRef.current.reset()
    gridQuantizerRef.current.reset()
    panelQuantizerRef.current.reset()
    protocolRef.current = createIdleProtocolState()
    setProtocol(protocolRef.current)
    setPoint(null)
    setActiveGridRegion(null)
    setActivePanelRegion(null)
    setEvents([])
    setCalibrationProgress(null)
    setCalibrationResiduals([])
    setCalibrationDiagnostics(null)
    setCalibrationLayers([])
    setPoseCoverage(null)
    setTeachStatus("idle")
    setTeachTarget(null)
    setTeachCollected(0)
    setCorrectionCount(0)
  }, [])

  const stopCamera = useCallback(() => {
    releaseCamera()
    resetTrackingState()
    setPhase("off")
    setConfidence("low")
    setConfidenceReason("Camera is off")
    setTrackingUptimeMs(0)
  }, [releaseCamera, resetTrackingState])

  useEffect(() => releaseCamera, [releaseCamera])

  const startCamera = useCallback(async () => {
    setPhase("starting")
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not expose camera access.")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: "user",
        },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error("Camera preview was not mounted.")
      video.srcObject = stream
      await video.play()
      estimatorRef.current = await createGazeEstimator()
      trackingStartedAtRef.current = performance.now()
      setConfidenceReason("Ready to calibrate")
      setPhase("ready")
    } catch (cause) {
      releaseCamera()
      setError(
        cause instanceof Error ? cause.message : "Could not start the camera.",
      )
      setPhase("error")
    }
  }, [releaseCamera])

  const beginCalibration = useCallback((mode: CalibrationMode) => {
    calibrationModeRef.current = mode
    setCalibrationMode(mode)
    if (mode === "replace") {
      calibrationLayersRef.current = []
      setCalibrationLayers([])
      setPoseCoverage(null)
      correctionFieldRef.current.clear()
      setCorrectionCount(0)
    }
    calibrationSamplesRef.current = []
    calibrationTargetsRef.current = createCalibrationTargets()
    calibrationTargetIndexRef.current = 0
    calibrationTargetFramesRef.current = 0
    calibrationSettlerRef.current.reset()
    teachActiveRef.current = false
    teachTargetRef.current = null
    teachSamplesRef.current = []
    teachSettlerRef.current.reset()
    protocolRef.current = createIdleProtocolState()
    setProtocol(protocolRef.current)
    setCalibrationProgress({ targetIndex: 0, collected: 0, settling: true })
    setCalibrationResiduals([])
    setCalibrationDiagnostics(null)
    setTeachStatus("idle")
    setTeachTarget(null)
    setTeachCollected(0)
    setPhase("calibrating")
  }, [])

  const finishCalibration = useCallback(() => {
    try {
      const targetSamples = calibrationTargetsRef.current.map(
        (_, targetIndex) =>
          summarizeCalibrationTarget(
            calibrationSamplesRef.current.slice(
              targetIndex * CALIBRATION_FRAMES,
              (targetIndex + 1) * CALIBRATION_FRAMES,
            ),
          ).sample,
      )
      const layer = fitPoseCalibrationLayer(targetSamples)
      const layers =
        calibrationModeRef.current === "replace"
          ? [layer]
          : upsertPoseCalibrationLayer(calibrationLayersRef.current, layer)
      calibrationLayersRef.current = layers
      setCalibrationLayers(layers)
      setCalibrationDiagnostics(layer.calibration.diagnostics)
      setCalibrationResiduals(
        leaveOneTargetOutResiduals(targetSamples, layer.calibration),
      )
      setCalibrationProgress(null)
      xFilterRef.current.reset()
      yFilterRef.current.reset()
      gridQuantizerRef.current.reset()
      panelQuantizerRef.current.reset()
      setPhase("tracking")
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Calibration fit failed.",
      )
      setPhase(calibrationLayersRef.current.length ? "tracking" : "ready")
    }
  }, [])

  const finishTeach = useCallback(() => {
    const layers = calibrationLayersRef.current
    const target = teachTargetRef.current
    const samples = teachSamplesRef.current
    teachActiveRef.current = false
    teachSamplesRef.current = []
    teachSettlerRef.current.reset()
    setTeachCollected(0)
    if (!layers.length || !target || samples.length < TEACH_FRAMES) {
      setTeachStatus("idle")
      setTeachTarget(null)
      return
    }
    const summary = summarizeCalibrationTarget(samples).sample
    const predicted = predictLayeredGaze(layers, summary.features).point
    correctionFieldRef.current.teach(predicted, target)
    setCorrectionCount(correctionFieldRef.current.getAnchors().length)
    setTeachStatus("learned")
    setTeachTarget(null)
    xFilterRef.current.reset()
    yFilterRef.current.reset()
    window.setTimeout(() => setTeachStatus("idle"), 900)
  }, [])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Shift" ||
        event.repeat ||
        phase !== "tracking" ||
        protocolRef.current.phase !== "idle" ||
        !pointerRef.current
      ) {
        return
      }
      teachActiveRef.current = true
      teachTargetRef.current = { ...pointerRef.current }
      teachSamplesRef.current = []
      teachSettlerRef.current.reset()
      setTeachTarget({ ...pointerRef.current })
      setTeachStatus("settling")
      setTeachCollected(0)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift" && teachActiveRef.current) finishTeach()
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
    }
  }, [finishTeach, phase])

  useEffect(() => {
    if (
      !estimatorRef.current ||
      !["ready", "calibrating", "tracking"].includes(phase)
    ) {
      return
    }

    let cancelled = false
    const frame = (now: number) => {
      if (cancelled) return
      animationFrameRef.current = requestAnimationFrame(frame)
      if (now - lastFrameAtRef.current < FRAME_INTERVAL_MS) return
      lastFrameAtRef.current = now

      const video = videoRef.current
      const estimator = estimatorRef.current
      if (
        !video ||
        !estimator ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        return
      }

      const frameStartedAt = performance.now()
      const sample = estimator.sample(video, now)
      setConfidence(sample.confidence)
      setConfidenceReason(sample.confidenceReason ?? "Signal usable")
      setTrackingUptimeMs(now - trackingStartedAtRef.current)

      if (phase === "calibrating") {
        const targetIndex = calibrationTargetIndexRef.current
        let settling = true
        if (sample.confidence === "high" && sample.features) {
          const fixation = calibrationSettlerRef.current.update(
            sample.features.values,
          )
          settling = !fixation.stable
        }
        if (!settling && sample.confidence === "high" && sample.features) {
          const position = calibrationTargetsRef.current[targetIndex]
          if (!position) return
          calibrationSamplesRef.current.push({
            features: sample.features.values,
            target: {
              x: position[0] * window.innerWidth,
              y: position[1] * window.innerHeight,
            },
          })
          calibrationTargetFramesRef.current += 1

          if (calibrationTargetFramesRef.current >= CALIBRATION_FRAMES) {
            if (targetIndex + 1 >= calibrationTargetsRef.current.length) {
              finishCalibration()
              return
            }
            calibrationTargetIndexRef.current += 1
            calibrationTargetFramesRef.current = 0
            calibrationSettlerRef.current.reset()
            settling = true
          }
        }
        setCalibrationProgress({
          targetIndex: calibrationTargetIndexRef.current,
          collected: calibrationTargetFramesRef.current,
          settling,
        })
        return
      }

      if (phase !== "tracking" || !calibrationLayersRef.current.length) return

      let activeGrid = activeGridRegion
      if (sample.features) {
        xFilterRef.current.setOptions(filterOptions)
        yFilterRef.current.setOptions(filterOptions)
        const layeredPrediction = predictLayeredGaze(
          calibrationLayersRef.current,
          sample.features.values,
        )
        setPoseCoverage({
          coverage: layeredPrediction.coverage,
          nearestDistance: layeredPrediction.nearestDistance,
        })
        const baseRaw = layeredPrediction.point
        const raw = clampPoint(correctionFieldRef.current.apply(baseRaw))
        const smoothed = {
          x: xFilterRef.current.filter(raw.x, now),
          y: yFilterRef.current.filter(raw.y, now),
        }
        setPoint(smoothed)

        if (teachActiveRef.current && teachTargetRef.current) {
          const pointer = pointerRef.current
          const heldTarget = teachTargetRef.current
          if (
            !pointer ||
            Math.hypot(pointer.x - heldTarget.x, pointer.y - heldTarget.y) > 8
          ) {
            teachTargetRef.current = pointer ? { ...pointer } : null
            teachSamplesRef.current = []
            teachSettlerRef.current.reset()
            setTeachTarget(pointer ? { ...pointer } : null)
            setTeachStatus("settling")
            setTeachCollected(0)
          } else if (sample.confidence === "high") {
            const fixation = teachSettlerRef.current.update(
              sample.features.values,
            )
            if (
              fixation.stable &&
              teachSamplesRef.current.length < TEACH_FRAMES
            ) {
              teachSamplesRef.current.push({
                features: sample.features.values,
                target: { ...heldTarget },
              })
              setTeachStatus("collecting")
              setTeachCollected(teachSamplesRef.current.length)
            }
          }
        }

        const viewport = {
          width: window.innerWidth,
          height: window.innerHeight,
        }
        const confident = sample.confidence === "high"
        const gridUpdate = gridQuantizerRef.current.update(
          smoothed,
          now,
          grid3x3Regions(viewport.width, viewport.height),
          viewport,
          confident,
        )
        const panelUpdate = panelQuantizerRef.current.update(
          smoothed,
          now,
          panelRegions(viewport.width, viewport.height),
          viewport,
          confident,
        )
        activeGrid = gridUpdate.activeRegion
        setActiveGridRegion(gridUpdate.activeRegion)
        setActivePanelRegion(panelUpdate.activeRegion)
        const nextEvents = [...gridUpdate.events, ...panelUpdate.events]
        if (nextEvents.length) {
          setEvents((current) => [...nextEvents, ...current].slice(0, 50))
        }
      }

      if (protocolRef.current.phase !== "idle") {
        const nextProtocol = advanceProtocol(protocolRef.current, {
          t: now,
          activeGridRegion: sample.confidence === "high" ? activeGrid : null,
          processingMs: performance.now() - frameStartedAt,
        })
        if (nextProtocol !== protocolRef.current) {
          protocolRef.current = nextProtocol
          setProtocol(nextProtocol)
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(frame)
    return () => {
      cancelled = true
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [activeGridRegion, filterOptions, finishCalibration, phase])

  const runProtocol = useCallback(() => {
    const now = performance.now()
    const next = startProtocol(now, trackingStartedAtRef.current, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    protocolRef.current = next
    setProtocol(next)
  }, [])

  const calibrationTarget = calibrationProgress
    ? calibrationTargetsRef.current[calibrationProgress.targetIndex]
    : null
  const protocolTarget = currentProtocolTarget(protocol)
  const driftWaitRemaining = Math.max(
    0,
    PROTOCOL_DRIFT_WAIT_MS - trackingUptimeMs,
  )

  const findings = useMemo(() => {
    if (!protocol.report) return null
    const recommendation = recommendProtocol(protocol.report)
    return {
      storyId: "GZ.1",
      protocolVersion: 3,
      capturedAt: new Date().toISOString(),
      baseline: protocol.report.baseline,
      drift: protocol.report.drift,
      driftDeltaPercentagePoints: protocol.report.driftDeltaPercentagePoints,
      performance: protocol.report.performance,
      poseCalibration: {
        layerCount: calibrationLayers.length,
        layers: calibrationLayers.map((layer) => ({
          pose: layer.pose,
          diagnostics: layer.calibration.diagnostics,
        })),
      },
      localCorrections: correctionFieldRef.current.getAnchors(),
      observations,
      recommendation,
      recommendationLine: `${recommendation} — thresholds: wire ≥80% baseline, ≥75% drift, ≤10pp drift, ≤8ms mean; iterate ≥55% baseline, ≥50% drift, ≤16ms mean; otherwise drop.`,
    }
  }, [calibrationLayers, observations, protocol.report])
  const findingsJson = findings ? JSON.stringify(findings, null, 2) : ""

  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <video
        ref={videoRef}
        className="pointer-events-none fixed size-px opacity-0"
        muted
        playsInline
      />

      <div className="absolute inset-0 grid grid-cols-[22vw_1fr_22vw] grid-rows-[1fr_22vh] gap-px bg-border/50">
        <section
          className={`relative row-span-2 overflow-auto border transition-colors ${panelGlow(activePanelRegion === "panel-left", showRegionGlow, confidence === "high")}`}
        >
          <div className="space-y-5 p-4 pt-20">
            <div>
              <h1 className="flex items-center gap-2 text-sm font-semibold">
                <EyeIcon className="size-4" /> Gaze lab
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Experimental · local-only · GZ.1
              </p>
            </div>

            <fieldset
              className="space-y-3 text-xs"
              disabled={phase !== "tracking"}
            >
              <legend className="mb-2 font-medium">Perceptible sensing</legend>
              <label className="flex items-center justify-between gap-3">
                Soft cursor
                <input
                  type="checkbox"
                  checked={showCursor}
                  onChange={(event) => {
                    if (!event.target.checked && !showRegionGlow) return
                    setShowCursor(event.target.checked)
                  }}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                Region glow
                <input
                  type="checkbox"
                  checked={showRegionGlow}
                  onChange={(event) => {
                    if (!event.target.checked && !showCursor) return
                    setShowRegionGlow(event.target.checked)
                  }}
                />
              </label>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                At least one indicator remains on. There is no silent tracking
                mode.
              </p>
            </fieldset>

            <div className="space-y-2 text-xs">
              <h2 className="font-medium">Hold-to-teach</h2>
              <p className="leading-relaxed text-muted-foreground">
                Put the real mouse pointer where the estimate is wrong. Hold
                Shift and stare at the pointer until 18/18, then release. Nearby
                errors improve; distant calibration stays intact.
              </p>
              <p className="font-mono text-[10px] text-cyan-300">
                {teachStatus === "idle"
                  ? `${correctionCount} local correction${correctionCount === 1 ? "" : "s"}`
                  : teachStatus === "learned"
                    ? "local correction learned"
                    : `${teachStatus} · ${teachCollected}/${TEACH_FRAMES}`}
              </p>
            </div>

            <fieldset className="space-y-3 text-xs">
              <legend className="mb-2 font-medium">
                <HelpLabel help="A motion filter that suppresses webcam jitter while remaining responsive when your gaze moves quickly.">
                  One Euro tuning
                </HelpLabel>
              </legend>
              {TUNING_CONTROLS.map(({ key, min, max, step, help }) => (
                <div key={key} className="space-y-1">
                  <span className="flex justify-between">
                    <HelpLabel help={help}>{key}</HelpLabel>
                    <code>{filterOptions[key].toFixed(3)}</code>
                  </span>
                  <input
                    aria-label={key}
                    className="w-full accent-cyan-400"
                    disabled={phase !== "tracking"}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={filterOptions[key]}
                    onChange={(event) =>
                      setFilterOptions((current) => ({
                        ...current,
                        [key]: Number(event.target.value),
                      }))
                    }
                  />
                </div>
              ))}
            </fieldset>

            {calibrationResiduals.length > 0 && (
              <div className="text-xs">
                <h2 className="font-medium">
                  <HelpLabel help="Pixel distance between each target and a prediction made without training on that target. Lower is better; very uneven cells usually indicate a weak screen region.">
                    Held-out calibration error
                  </HelpLabel>
                </h2>
                <div className="mt-2 grid grid-cols-3 gap-1 font-mono text-[10px]">
                  {calibrationResiduals.map((residual, index) => (
                    <span
                      key={index}
                      className="rounded bg-muted px-1.5 py-1 text-center"
                    >
                      {residual.toFixed(0)}px
                    </span>
                  ))}
                </div>
              </div>
            )}

            {calibrationDiagnostics && (
              <div className="space-y-1 text-xs text-muted-foreground">
                <h2 className="font-medium text-foreground">
                  <HelpLabel help="Diagnostics for the most recently added head-position profile. They describe systematic offset, usable range, and which eye measurements survived validation.">
                    Calibration shape
                  </HelpLabel>
                </h2>
                <p>
                  <HelpLabel help="Average signed horizontal error. Positive means predictions lean right; negative means they lean left.">
                    X bias
                  </HelpLabel>{" "}
                  {calibrationDiagnostics.x.biasPixels.toFixed(0)}px ·{" "}
                  <HelpLabel help="How much of the calibrated horizontal range the model reproduces. 1.00 is ideal; below 1 compresses toward center.">
                    gain
                  </HelpLabel>{" "}
                  {calibrationDiagnostics.x.gain.toFixed(2)} ·{" "}
                  <HelpLabel help="Indices of the eye-local measurements selected for this axis after held-out validation. Head-pose features are intentionally excluded.">
                    features
                  </HelpLabel>{" "}
                  [{calibrationDiagnostics.x.selectedFeatureIndices.join(", ")}]
                </p>
                <p>
                  <HelpLabel help="Average signed vertical error. Positive means predictions lean down; negative means they lean up.">
                    Y bias
                  </HelpLabel>{" "}
                  {calibrationDiagnostics.y.biasPixels.toFixed(0)}px ·{" "}
                  <HelpLabel help="How much of the calibrated vertical range the model reproduces. 1.00 is ideal; below 1 compresses toward center.">
                    gain
                  </HelpLabel>{" "}
                  {calibrationDiagnostics.y.gain.toFixed(2)} ·{" "}
                  <HelpLabel help="Indices of the eye-local measurements selected for this axis after held-out validation. Head-pose features are intentionally excluded.">
                    features
                  </HelpLabel>{" "}
                  [{calibrationDiagnostics.y.selectedFeatureIndices.join(", ")}]
                </p>
                {(calibrationDiagnostics.x.lowEvidence ||
                  calibrationDiagnostics.y.lowEvidence) && (
                  <p className="text-amber-300">
                    Weak eye discrimination detected; recalibrate with steadier
                    fixation and wider target coverage.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          className={`relative border transition-colors ${panelGlow(activePanelRegion === "panel-main", showRegionGlow, confidence === "high")}`}
        >
          <div className="grid h-full place-items-center p-8 text-center">
            {phase === "off" || phase === "error" ? (
              <div className="max-w-md rounded-xl border bg-card/95 p-6 shadow-xl">
                <CameraIcon className="mx-auto size-7 text-cyan-400" />
                <h2 className="mt-4 text-base font-semibold">Camera consent</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Video is processed entirely in this tab. Nothing is recorded
                  or sent anywhere. Tracking stops the moment you click Stop,
                  including the camera hardware track.
                </p>
                {error && (
                  <p className="mt-3 text-xs text-destructive">{error}</p>
                )}
                <Button className="mt-5" onClick={startCamera}>
                  <CameraIcon className="size-4" /> Allow camera and start
                </Button>
              </div>
            ) : phase === "starting" ? (
              <p className="text-sm text-muted-foreground">
                Loading local gaze model…
              </p>
            ) : phase === "ready" ? (
              <div className="max-w-sm rounded-xl border bg-card/90 p-6">
                <CrosshairIcon className="mx-auto size-6 text-cyan-400" />
                <h2 className="mt-3 text-sm font-semibold">
                  Ready to calibrate
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Keep your head comfortable and follow sixteen randomized
                  targets. Collection begins only when your eyes and head have
                  measurably settled, then keeps 24 usable frames. Stay at one
                  distance with even light on your face.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => beginCalibration("replace")}
                >
                  Begin calibration
                </Button>
              </div>
            ) : (
              <div className="max-w-md space-y-3 text-sm text-muted-foreground">
                <p>
                  {phase === "calibrating"
                    ? calibrationMode === "add"
                      ? "Keep your head in the new position and look at each target until it moves."
                      : "Look at the target until it moves."
                    : protocol.phase === "idle"
                      ? poseCoverage?.coverage === "outside"
                        ? "This head position is outside calibrated coverage. Hold it comfortably, then add it as another position."
                        : "Calibration complete. Move naturally; nearby head-position profiles blend automatically."
                      : protocol.phase === "waiting-drift"
                        ? `Baseline complete. Drift run starts automatically in ${Math.ceil(driftWaitRemaining / 1000)}s.`
                        : protocol.phase === "complete"
                          ? "Protocol complete. Add observations and copy the JSON findings."
                          : "Follow the accuracy target."}
                </p>
                {phase === "tracking" && protocol.phase === "idle" && (
                  <Button onClick={runProtocol}>
                    Run full accuracy protocol
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        <section
          className={`relative row-span-2 overflow-auto border transition-colors ${panelGlow(activePanelRegion === "panel-right", showRegionGlow, confidence === "high")}`}
        >
          <div className="space-y-5 p-4 pt-20 text-xs">
            <div>
              <h2 className="font-medium">Live signal</h2>
              <dl className="mt-2 space-y-1.5 text-muted-foreground">
                <div className="flex justify-between gap-2">
                  <dt>Confidence</dt>
                  <dd
                    className={
                      confidence === "high"
                        ? "text-emerald-400"
                        : "text-amber-400"
                    }
                  >
                    {confidence}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Grid</dt>
                  <dd className="font-mono text-foreground">
                    {activeGridRegion ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Panel</dt>
                  <dd className="font-mono text-foreground">
                    {activePanelRegion ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Uptime</dt>
                  <dd>{Math.floor(trackingUptimeMs / 1000)}s</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>
                    <HelpLabel help="How close your current head orientation and position are to a recorded calibration profile. Add a position when this says outside.">
                      Pose coverage
                    </HelpLabel>
                  </dt>
                  <dd
                    className={
                      poseCoverage?.coverage === "covered"
                        ? "text-emerald-400"
                        : poseCoverage?.coverage === "outside"
                          ? "text-destructive"
                          : "text-amber-400"
                    }
                  >
                    {poseCoverage?.coverage ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>
                    <HelpLabel help="Number of distinct head positions currently recorded. Nearby repeated calibrations replace one another instead of creating duplicates.">
                      Head profiles
                    </HelpLabel>
                  </dt>
                  <dd>{calibrationLayers.length}</dd>
                </div>
              </dl>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {confidenceReason}
              </p>
            </div>

            <div>
              <h2 className="font-medium">Region events</h2>
              <ol className="mt-2 max-h-56 space-y-1 overflow-auto font-mono text-[9px] text-muted-foreground">
                {events.length ? (
                  events.map((event, index) => (
                    <li key={`${event.t}-${event.region}-${index}`}>
                      {event.type.padEnd(5)} {event.region} @
                      {Math.round(event.t)}
                    </li>
                  ))
                ) : (
                  <li>No confident transition yet.</li>
                )}
              </ol>
            </div>

            {protocol.report && (
              <div className="space-y-2">
                <h2 className="font-medium">Accuracy</h2>
                <p>
                  Baseline:{" "}
                  {formatPercent(
                    protocol.report.baseline.overall.accuracyPercent,
                  )}
                </p>
                <p>
                  Drift:{" "}
                  {formatPercent(protocol.report.drift.overall.accuracyPercent)}
                </p>
                <p>
                  Delta: {protocol.report.driftDeltaPercentagePoints.toFixed(1)}
                  pp
                </p>
                <p>
                  Mean / max:{" "}
                  {protocol.report.performance.meanFrameMs.toFixed(2)} /{" "}
                  {protocol.report.performance.maxFrameMs.toFixed(2)}ms
                </p>
                <p>
                  Main thread:{" "}
                  {formatPercent(
                    protocol.report.performance.mainThreadUtilizationPercent,
                  )}
                </p>
                <p className="font-semibold uppercase text-cyan-300">
                  Recommendation: {recommendProtocol(protocol.report)}
                </p>
              </div>
            )}
          </div>
        </section>

        <section
          className={`relative border transition-colors ${panelGlow(activePanelRegion === "panel-composer", showRegionGlow, confidence === "high")}`}
        >
          <div className="flex h-full items-center justify-center px-6 text-xs text-muted-foreground">
            Composer-shaped region · included in simultaneous panel quantization
          </div>
        </section>
      </div>

      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-amber-400/15 px-2 py-1 font-medium text-amber-300">
            Experimental
          </span>
          <span className="text-muted-foreground">
            No persistence · no attention wiring
          </span>
        </div>
        <div className="flex gap-2">
          {phase === "tracking" && protocol.phase === "idle" && (
            <>
              <Button size="sm" onClick={() => beginCalibration("add")}>
                <CrosshairIcon className="size-3.5" /> Add head position
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Start calibration over"
                      variant="outline"
                      size="sm"
                      onClick={() => beginCalibration("replace")}
                    />
                  }
                >
                  <RotateCcwIcon className="size-3.5" /> Start over
                </TooltipTrigger>
                <TooltipContent>
                  Discard every head-position profile and local correction.
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {phase !== "off" && phase !== "error" && (
            <Button variant="destructive" size="sm" onClick={stopCamera}>
              <SquareIcon className="size-3" /> Stop camera
            </Button>
          )}
        </div>
      </header>

      {calibrationTarget && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${calibrationTarget[0] * 100}%`,
            top: `${calibrationTarget[1] * 100}%`,
          }}
        >
          <div className="grid size-12 place-items-center rounded-full border-2 border-cyan-300 bg-cyan-300/15 shadow-[0_0_32px_rgba(103,232,249,0.55)]">
            <div className="size-2 rounded-full bg-cyan-200" />
          </div>
          <p className="mt-2 -translate-x-1/4 whitespace-nowrap rounded bg-background/90 px-2 py-1 font-mono text-[10px]">
            Target {(calibrationProgress?.targetIndex ?? 0) + 1}/
            {calibrationTargetsRef.current.length} ·{" "}
            {calibrationProgress?.settling
              ? "settle"
              : `${calibrationProgress?.collected ?? 0}/${CALIBRATION_FRAMES}`}
          </p>
        </div>
      )}

      {protocolTarget && (
        <div
          className="pointer-events-none fixed z-40 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-fuchsia-300 bg-fuchsia-300/15 shadow-[0_0_36px_rgba(240,171,252,0.5)]"
          style={{
            left: protocolTarget.target.x,
            top: protocolTarget.target.y,
          }}
        >
          <CrosshairIcon className="size-6 text-fuchsia-200" />
        </div>
      )}

      {teachTarget && (
        <div
          className="pointer-events-none fixed z-[60] grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-amber-300 bg-amber-300/10 shadow-[0_0_24px_rgba(252,211,77,0.45)]"
          style={{ left: teachTarget.x, top: teachTarget.y }}
        >
          <CrosshairIcon className="size-4 text-amber-200" />
        </div>
      )}

      {phase === "tracking" && point && showCursor && (
        <div
          className={`pointer-events-none fixed z-50 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity ${confidence === "high" ? "bg-[radial-gradient(circle,rgba(34,211,238,0.58)_0%,rgba(34,211,238,0.18)_45%,transparent_72%)] opacity-100" : "border border-cyan-300/60 bg-transparent opacity-45"}`}
          style={{ left: point.x, top: point.y }}
          aria-hidden="true"
        />
      )}

      {protocol.report && (
        <aside className="fixed inset-x-[12%] bottom-4 z-50 max-h-[46vh] overflow-auto rounded-xl border bg-background/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">GZ.1 findings payload</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add environmental observations before copying this into the
                story comment.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(findingsJson)}
            >
              <CopyIcon className="size-3.5" /> Copy JSON
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span>Lighting</span>
              <input
                className="w-full rounded border bg-background px-2 py-1.5"
                value={observations.lighting}
                onChange={(event) =>
                  setObservations((current) => ({
                    ...current,
                    lighting: event.target.value,
                  }))
                }
                placeholder="daylight, dim…"
              />
            </label>
            <label className="space-y-1">
              <span>Glasses</span>
              <input
                className="w-full rounded border bg-background px-2 py-1.5"
                value={observations.glasses}
                onChange={(event) =>
                  setObservations((current) => ({
                    ...current,
                    glasses: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span>Indicator preference</span>
              <select
                className="w-full rounded border bg-background px-2 py-1.5"
                value={observations.indicatorPreference}
                onChange={(event) =>
                  setObservations((current) => ({
                    ...current,
                    indicatorPreference: event.target
                      .value as ObservationFields["indicatorPreference"],
                  }))
                }
              >
                <option value="cursor">cursor</option>
                <option value="region-glow">region glow</option>
                <option value="both">both</option>
              </select>
            </label>
            <label className="space-y-1">
              <span>Failure modes</span>
              <input
                className="w-full rounded border bg-background px-2 py-1.5"
                value={observations.failureModes}
                onChange={(event) =>
                  setObservations((current) => ({
                    ...current,
                    failureModes: event.target.value,
                  }))
                }
                placeholder="lost face, edge bias…"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 text-[10px]">
            {Object.entries(protocol.report.baseline.perRegion).map(
              ([region, baseline]) => {
                const drift = protocol.report?.drift.perRegion[region]
                return (
                  <div
                    key={region}
                    className="rounded border bg-muted/20 px-2 py-1.5"
                  >
                    <div className="font-mono text-muted-foreground">
                      {region}
                    </div>
                    <div>
                      {formatPercent(baseline.accuracyPercent)} →{" "}
                      {formatPercent(drift?.accuracyPercent ?? 0)}
                    </div>
                  </div>
                )
              },
            )}
          </div>
          <textarea
            className="mt-3 h-32 w-full resize-y rounded border bg-muted/30 p-2 font-mono text-[9px]"
            readOnly
            value={findingsJson}
          />
        </aside>
      )}

      <div className="sr-only" aria-live="polite">
        {confidence === "high" ? <EyeIcon /> : <EyeOffIcon />}
        {confidenceReason}
      </div>
    </main>
  )
}
