import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CameraIcon,
  CopyIcon,
  HandIcon,
  MoveIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TargetIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import type { OneEuroOptions } from "../gaze/one-euro"
import {
  createHandEstimator,
  type HandConfidence,
  type HandEstimator,
} from "./estimator"
import {
  HAND_CONNECTIONS,
  toScreenPoint,
  type HandFeatures,
  type Point2D,
} from "./features"
import { GestureDwell, type ConfirmedGesture } from "./gestures"
import { PinchHysteresis } from "./pinch"
import {
  beginProtocolDrag,
  buildHandsProtocolReport,
  createIdleHandsProtocol,
  currentGesturePrompt,
  currentPinchTrial,
  endProtocolDrag,
  recordGestureResult,
  recordPerformance,
  recordPinchAttempt,
  recordProtocolDragPoint,
  startHandsProtocol,
  type HandsProtocolState,
} from "./protocol"

type LabPhase = "off" | "starting" | "tracking" | "error"

interface ScreenHand extends HandFeatures {
  key: string
  cursor: Point2D
  screenLandmarks: Point2D[]
  pinched: boolean
}

interface DragSession {
  source: "pinch" | "grab"
  handKey: string
  offset: Point2D
}

interface TransformSession {
  handKeys: [string, string]
  startDistance: number
  startAngle: number
  startScale: number
  startRotation: number
}

interface Observations {
  lighting: string
  cameraDistance: string
  failureModes: string
}

const FRAME_INTERVAL_MS = 1000 / 30

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function angle(a: Point2D, b: Point2D) {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function gestureLabel(gesture: ConfirmedGesture | "grab" | null) {
  if (!gesture) return "neutral"
  return gesture.replace("-", " ")
}

function confidenceColor(confidence: HandConfidence) {
  return confidence === "high" ? "text-emerald-400" : "text-amber-400"
}

export function HandsLab() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const estimatorRef = useRef<HandEstimator | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef(0)
  const trackingStartedAtRef = useRef(0)
  const pinchDetectorsRef = useRef(new Map<string, PinchHysteresis>())
  const grabDetectorsRef = useRef(new Map<string, PinchHysteresis>())
  const gestureDwellRef = useRef(new GestureDwell(650))
  const focusedTargetRef = useRef<HTMLElement | null>(null)
  const previousHandsRef = useRef<ScreenHand[]>([])
  const dragSessionRef = useRef<DragSession | null>(null)
  const transformSessionRef = useRef<TransformSession | null>(null)
  const protocolRef = useRef<HandsProtocolState>(createIdleHandsProtocol())
  const panelPositionRef = useRef({ x: 0, y: 0 })
  const imageTransformRef = useRef({ scale: 1, rotation: 0 })

  const [phase, setPhase] = useState<LabPhase>("off")
  const [error, setError] = useState<string | null>(null)
  const [confidence, setConfidence] = useState<HandConfidence>("low")
  const [confidenceReason, setConfidenceReason] = useState("Camera is off")
  const [hands, setHands] = useState<ScreenHand[]>([])
  const [meanProcessingMs, setMeanProcessingMs] = useState(0)
  const [trackingUptimeMs, setTrackingUptimeMs] = useState(0)
  const [dwell, setDwell] = useState({
    candidate: null as ConfirmedGesture | null,
    progress: 0,
  })
  const [lastConfirmedGesture, setLastConfirmedGesture] =
    useState<ConfirmedGesture | null>(null)
  const [activationCount, setActivationCount] = useState(0)
  const [lastTarget, setLastTarget] = useState("—")
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 })
  const [imageTransform, setImageTransform] = useState({
    scale: 1,
    rotation: 0,
  })
  const [filterOptions, setFilterOptions] = useState<OneEuroOptions>({
    minCutoff: 1.2,
    beta: 0.015,
    dCutoff: 1,
  })
  const [protocol, setProtocol] = useState<HandsProtocolState>(() =>
    createIdleHandsProtocol(),
  )
  const [observations, setObservations] = useState<Observations>({
    lighting: "",
    cameraDistance: "",
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

  const clearFocusedTarget = useCallback(() => {
    focusedTargetRef.current?.removeAttribute("data-hand-focused")
    focusedTargetRef.current = null
  }, [])

  const resetTrackingState = useCallback(() => {
    pinchDetectorsRef.current.clear()
    grabDetectorsRef.current.clear()
    gestureDwellRef.current.reset()
    dragSessionRef.current = null
    transformSessionRef.current = null
    protocolRef.current = createIdleHandsProtocol()
    panelPositionRef.current = { x: 0, y: 0 }
    imageTransformRef.current = { scale: 1, rotation: 0 }
    clearFocusedTarget()
    previousHandsRef.current = []
    setHands([])
    setMeanProcessingMs(0)
    setTrackingUptimeMs(0)
    setDwell({ candidate: null, progress: 0 })
    setLastConfirmedGesture(null)
    setLastTarget("—")
    setPanelPosition(panelPositionRef.current)
    setImageTransform(imageTransformRef.current)
    setProtocol(protocolRef.current)
  }, [clearFocusedTarget])

  const stopCamera = useCallback(() => {
    releaseCamera()
    resetTrackingState()
    setPhase("off")
    setConfidence("low")
    setConfidenceReason("Camera is off")
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
      estimatorRef.current = await createHandEstimator()
      estimatorRef.current.setFilterOptions(filterOptions)
      trackingStartedAtRef.current = performance.now()
      setConfidenceReason("Show one hand to begin")
      setPhase("tracking")
    } catch (cause) {
      releaseCamera()
      setError(
        cause instanceof Error ? cause.message : "Could not start the camera.",
      )
      setPhase("error")
    }
  }, [filterOptions, releaseCamera])

  const activateTarget = useCallback((point: Point2D) => {
    const hit = document.elementFromPoint(
      point.x,
      point.y,
    ) as HTMLElement | null
    const target = hit?.closest<HTMLElement>("[data-hand-target]") ?? null
    if (!target) return false
    target.setAttribute("data-hand-active", "")
    window.setTimeout(() => target.removeAttribute("data-hand-active"), 240)
    target.dispatchEvent(new CustomEvent("handactivate", { bubbles: true }))
    if (target instanceof HTMLButtonElement) target.click()
    setActivationCount((current) => current + 1)
    setLastTarget(
      target.dataset.handLabel ?? target.textContent?.trim() ?? "target",
    )
    return true
  }, [])

  const beginPanelDrag = useCallback(
    (source: DragSession["source"], hand: ScreenHand) => {
      if (!["idle", "complete"].includes(protocolRef.current.phase))
        return false
      const hit = document.elementFromPoint(
        hand.cursor.x,
        hand.cursor.y,
      ) as HTMLElement | null
      if (!hit?.closest("[data-hand-drag]")) return false
      dragSessionRef.current = {
        source,
        handKey: hand.key,
        offset: {
          x: hand.cursor.x - panelPositionRef.current.x,
          y: hand.cursor.y - panelPositionRef.current.y,
        },
      }
      return true
    },
    [],
  )

  const updatePanelDrag = useCallback((hand: ScreenHand) => {
    const drag = dragSessionRef.current
    if (!drag || drag.handKey !== hand.key) return
    const next = {
      x: hand.cursor.x - drag.offset.x,
      y: hand.cursor.y - drag.offset.y,
    }
    panelPositionRef.current = next
    setPanelPosition(next)
  }, [])

  const cancelManipulation = useCallback(() => {
    dragSessionRef.current = null
    transformSessionRef.current = null
  }, [])

  const updateTargetFocus = useCallback((cursor: Point2D | null) => {
    let target: HTMLElement | null = null
    if (cursor) {
      const hit = document.elementFromPoint(
        cursor.x,
        cursor.y,
      ) as HTMLElement | null
      target = hit?.closest<HTMLElement>("[data-hand-target]") ?? null
    }
    if (target === focusedTargetRef.current) return
    focusedTargetRef.current?.removeAttribute("data-hand-focused")
    focusedTargetRef.current = target
    target?.setAttribute("data-hand-focused", "")
  }, [])

  useEffect(() => {
    if (phase !== "tracking" || !estimatorRef.current) return

    let cancelled = false
    let performanceTotal = 0
    let performanceFrames = 0

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

      const sample = estimator.sample(video, now)
      performanceTotal += sample.processingMs
      performanceFrames += 1
      setMeanProcessingMs(performanceTotal / performanceFrames)
      setTrackingUptimeMs(now - trackingStartedAtRef.current)
      setConfidence(sample.confidence)
      setConfidenceReason(sample.confidenceReason ?? "Signal usable")

      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const nextHands: ScreenHand[] = sample.hands.map((hand, index) => {
        const key = `${hand.handedness}-${index}`
        const detector =
          pinchDetectorsRef.current.get(key) ?? new PinchHysteresis()
        pinchDetectorsRef.current.set(key, detector)
        const pinch = detector.update(hand.pinchStrength)
        return {
          ...hand,
          key,
          cursor: toScreenPoint(hand.indexTip, viewport),
          screenLandmarks: hand.landmarks.map((landmark) =>
            toScreenPoint(landmark, viewport),
          ),
          pinched: pinch.pinched,
        }
      })
      let nextProtocol = recordPerformance(
        protocolRef.current,
        sample.processingMs,
      )
      const primary = [...nextHands].sort(
        (a, b) => b.confidence - a.confidence,
      )[0]
      updateTargetFocus(primary?.cursor ?? null)

      const pinchTransitions = nextHands.map((hand) => {
        // Calling update above already advanced the detector. Reconstruct the
        // edge from the prior rendered hand state; hand identity is chirality + index.
        const previous = previousHandsRef.current.find(
          (candidate) => candidate.key === hand.key,
        )
        return {
          hand,
          started: hand.pinched && !previous?.pinched,
          ended: !hand.pinched && previous?.pinched,
        }
      })

      for (const transition of pinchTransitions) {
        const { hand } = transition
        if (transition.started) {
          if (nextProtocol.phase === "pinch") {
            nextProtocol = recordPinchAttempt(nextProtocol, hand.cursor)
          } else if (nextProtocol.phase === "drag") {
            nextProtocol = beginProtocolDrag(nextProtocol, hand.cursor)
          } else if (!beginPanelDrag("pinch", hand)) {
            activateTarget(hand.cursor)
          }
        }
        if (hand.pinched) {
          if (nextProtocol.phase === "drag") {
            nextProtocol = recordProtocolDragPoint(nextProtocol, hand.cursor)
          }
          if (dragSessionRef.current?.source === "pinch") updatePanelDrag(hand)
        }
        if (transition.ended) {
          if (nextProtocol.phase === "drag")
            nextProtocol = endProtocolDrag(nextProtocol)
          if (
            dragSessionRef.current?.source === "pinch" &&
            dragSessionRef.current.handKey === hand.key
          ) {
            dragSessionRef.current = null
          }
        }
      }

      for (const hand of nextHands) {
        const detector =
          grabDetectorsRef.current.get(hand.key) ??
          new PinchHysteresis(0.72, 0.45)
        grabDetectorsRef.current.set(hand.key, detector)
        const grab = detector.update(hand.grabStrength)
        if (grab.type === "start") beginPanelDrag("grab", hand)
        if (grab.pinched && dragSessionRef.current?.source === "grab") {
          updatePanelDrag(hand)
        }
        if (
          grab.type === "end" &&
          dragSessionRef.current?.source === "grab" &&
          dragSessionRef.current.handKey === hand.key
        ) {
          dragSessionRef.current = null
        }
      }

      const pinchedHands = nextHands.filter((hand) => hand.pinched)
      if (
        pinchedHands.length >= 2 &&
        ["idle", "complete"].includes(nextProtocol.phase)
      ) {
        const first = pinchedHands[0]!
        const second = pinchedHands[1]!
        const midpoint = {
          x: (first.cursor.x + second.cursor.x) / 2,
          y: (first.cursor.y + second.cursor.y) / 2,
        }
        if (!transformSessionRef.current) {
          const hit = document.elementFromPoint(
            midpoint.x,
            midpoint.y,
          ) as HTMLElement | null
          if (hit?.closest("[data-hand-transform]")) {
            transformSessionRef.current = {
              handKeys: [first.key, second.key],
              startDistance: Math.max(1, distance(first.cursor, second.cursor)),
              startAngle: angle(first.cursor, second.cursor),
              startScale: imageTransformRef.current.scale,
              startRotation: imageTransformRef.current.rotation,
            }
            dragSessionRef.current = null
          }
        }
        const transform = transformSessionRef.current
        if (transform) {
          const byKey = new Map(nextHands.map((hand) => [hand.key, hand]))
          const a = byKey.get(transform.handKeys[0])
          const b = byKey.get(transform.handKeys[1])
          if (a && b) {
            const next = {
              scale: clamp(
                transform.startScale *
                  (distance(a.cursor, b.cursor) / transform.startDistance),
                0.55,
                2.4,
              ),
              rotation:
                transform.startRotation +
                (angle(a.cursor, b.cursor) - transform.startAngle),
            }
            imageTransformRef.current = next
            setImageTransform(next)
          }
        }
      } else {
        transformSessionRef.current = null
      }

      if (primary) {
        const gesture = gestureDwellRef.current.update(primary.gesture, now)
        setDwell({ candidate: gesture.candidate, progress: gesture.progress })
        if (gesture.confirmed) {
          setLastConfirmedGesture(gesture.confirmed)
          if (nextProtocol.phase === "gestures") {
            nextProtocol = recordGestureResult(nextProtocol, gesture.confirmed)
          } else if (gesture.confirmed === "open-palm") {
            cancelManipulation()
          } else if (gesture.confirmed === "thumbs-up") {
            activateTarget(primary.cursor)
          } else if (gesture.confirmed === "point") {
            setLastTarget(
              focusedTargetRef.current?.dataset.handLabel ??
                focusedTargetRef.current?.textContent?.trim() ??
                "focused point",
            )
          }
        }
      } else {
        gestureDwellRef.current.reset()
        setDwell({ candidate: null, progress: 0 })
      }

      if (nextProtocol !== protocolRef.current) {
        protocolRef.current = nextProtocol
        setProtocol(nextProtocol)
      }
      previousHandsRef.current = nextHands
      setHands(nextHands)
    }

    animationFrameRef.current = requestAnimationFrame(frame)
    return () => {
      cancelled = true
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [
    activateTarget,
    beginPanelDrag,
    cancelManipulation,
    phase,
    updatePanelDrag,
    updateTargetFocus,
  ])

  const startProtocol = useCallback(() => {
    gestureDwellRef.current.reset()
    const next = startHandsProtocol(performance.now(), {
      width: window.innerWidth,
      height: window.innerHeight,
    })
    protocolRef.current = next
    setProtocol(next)
  }, [])

  const resetDemo = useCallback(() => {
    cancelManipulation()
    panelPositionRef.current = { x: 0, y: 0 }
    imageTransformRef.current = { scale: 1, rotation: 0 }
    setPanelPosition(panelPositionRef.current)
    setImageTransform(imageTransformRef.current)
  }, [cancelManipulation])

  const report = useMemo(
    () => buildHandsProtocolReport(protocol, performance.now()),
    [protocol],
  )
  const findings = useMemo(
    () =>
      report
        ? {
            storyId: "HND.1",
            protocolVersion: 1,
            capturedAt: new Date().toISOString(),
            ...report,
            observations,
            thresholds: {
              tier1:
                "wire: ≤48px reliable, ≥80% hits, ≤8ms mean; iterate: ≤64px, ≥60%, ≤16ms; else drop",
              tier2:
                "wire: ≥10 samples and ≤30px mean path error; iterate: ≤70px; else drop",
              tier3:
                "wire: ≥85% confusion-matrix accuracy; iterate: ≥60%; else drop",
            },
          }
        : null,
    [observations, report],
  )
  const findingsJson = findings ? JSON.stringify(findings, null, 2) : ""
  const primary = [...hands].sort((a, b) => b.confidence - a.confidence)[0]
  const pinchTrial = currentPinchTrial(protocol)
  const gesturePrompt = currentGesturePrompt(protocol)
  const pathPoints = protocol.dragPath
    .map((point) => `${point.x},${point.y}`)
    .join(" ")

  return (
    <main className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <video
        ref={videoRef}
        className="pointer-events-none fixed size-px opacity-0"
        muted
        playsInline
      />

      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b bg-background/92 px-4 backdrop-blur">
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded bg-amber-400/15 px-2 py-1 font-medium text-amber-300">
            Experimental
          </span>
          <span className="text-muted-foreground">
            Local processing · no persistence · HND.1
          </span>
        </div>
        <div className="flex gap-2">
          {phase === "tracking" && (
            <Button variant="outline" size="sm" onClick={resetDemo}>
              <RotateCcwIcon className="size-3.5" /> Reset objects
            </Button>
          )}
          {phase === "tracking" && (
            <Button variant="destructive" size="sm" onClick={stopCamera}>
              <SquareIcon className="size-3" /> Stop camera
            </Button>
          )}
        </div>
      </header>

      <div className="grid min-h-svh grid-cols-[minmax(220px,18rem)_1fr_minmax(220px,18rem)] pt-14">
        <aside className="overflow-auto border-r p-4">
          <div className="space-y-5 text-xs">
            <div>
              <h1 className="flex items-center gap-2 text-sm font-semibold">
                <HandIcon className="size-4" /> Hands lab
              </h1>
              <p className="mt-1 text-muted-foreground">
                Fingertip point · pinch · manipulation · dwell gestures
              </p>
            </div>

            <div>
              <h2 className="font-medium">Interaction vocabulary</h2>
              <ol className="mt-2 space-y-2 text-muted-foreground">
                <li>
                  <strong className="text-foreground">1 · Cursor</strong> —
                  point, pinch, pinch-drag
                </li>
                <li>
                  <strong className="text-foreground">2 · Manipulate</strong> —
                  grab panel, two-hand transform
                </li>
                <li>
                  <strong className="text-foreground">3 · Gesture</strong> —
                  palm stop, thumb confirm, point focus
                </li>
              </ol>
            </div>

            <fieldset className="space-y-3" disabled={phase !== "tracking"}>
              <legend className="mb-2 font-medium">One Euro smoothing</legend>
              {(
                [
                  [
                    "minCutoff",
                    0.1,
                    5,
                    0.1,
                    "Lower is steadier; higher follows slow movement more closely.",
                  ],
                  [
                    "beta",
                    0,
                    0.1,
                    0.001,
                    "Adds responsiveness as hand speed increases.",
                  ],
                  [
                    "dCutoff",
                    0.1,
                    5,
                    0.1,
                    "Smooths the speed estimate that drives beta.",
                  ],
                ] as const
              ).map(([key, min, max, step, help]) => (
                <label key={key} className="block space-y-1" title={help}>
                  <span className="flex justify-between gap-2">
                    {key} <code>{filterOptions[key].toFixed(3)}</code>
                  </span>
                  <input
                    className="w-full accent-primary"
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={filterOptions[key]}
                    onChange={(event) => {
                      const next = {
                        ...filterOptions,
                        [key]: Number(event.target.value),
                      }
                      setFilterOptions(next)
                      estimatorRef.current?.setFilterOptions(next)
                    }}
                  />
                </label>
              ))}
            </fieldset>

            {phase === "tracking" && protocol.phase === "idle" && (
              <Button className="w-full" onClick={startProtocol}>
                <PlayIcon className="size-3.5" /> Run accuracy protocol
              </Button>
            )}
            {phase === "tracking" && protocol.phase !== "idle" && !report && (
              <div className="border-t pt-3">
                <p className="font-medium uppercase tracking-wide text-primary">
                  Protocol · {protocol.phase}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {protocol.phase === "pinch"
                    ? `Pinch target ${protocol.pinchIndex + 1}/16. Every pinch counts as an attempt.`
                    : protocol.phase === "drag"
                      ? "Pinch the start dot, trace the wave, then release."
                      : `Show ${gestureLabel(gesturePrompt)} until the dwell ring fills; return neutral between prompts.`}
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="relative overflow-hidden bg-[radial-gradient(circle_at_center,var(--color-muted)_0%,transparent_68%)]">
          {phase === "off" || phase === "error" ? (
            <div className="grid h-[calc(100svh-3.5rem)] place-items-center p-6">
              <div className="max-w-md rounded-xl border bg-card/95 p-6 shadow-xl">
                <CameraIcon className="mx-auto size-7 text-primary" />
                <h2 className="mt-4 text-center text-base font-semibold">
                  Camera consent
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Video is processed entirely in this tab. Nothing is recorded
                  or sent anywhere. Tracking stops the moment you click Stop,
                  including the camera hardware track.
                </p>
                {error && (
                  <p className="mt-3 text-xs text-destructive">{error}</p>
                )}
                <Button className="mt-5 w-full" onClick={startCamera}>
                  <CameraIcon className="size-4" /> Allow camera and start
                </Button>
              </div>
            </div>
          ) : phase === "starting" ? (
            <div className="grid h-[calc(100svh-3.5rem)] place-items-center text-sm text-muted-foreground">
              Loading local hand model…
            </div>
          ) : (
            <div className="relative h-[calc(100svh-3.5rem)]">
              <div
                data-hand-drag
                className="absolute left-[18%] top-[18%] z-10 w-64 rounded-lg border bg-card/92 shadow-lg backdrop-blur"
                style={{
                  transform: `translate(${panelPosition.x}px, ${panelPosition.y}px)`,
                }}
              >
                <div className="flex cursor-grab items-center gap-2 border-b px-3 py-2 text-xs font-medium">
                  <MoveIcon className="size-3.5" /> Grab or pinch-drag this
                  panel
                </div>
                <div className="space-y-3 p-3 text-xs text-muted-foreground">
                  <p>
                    Pinch a target to activate it. A closed hand acquires the
                    panel.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {["Amber", "Copper", "Signal", "Quiet"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        data-hand-target
                        data-hand-label={label}
                        className="rounded-md border px-3 py-3 text-foreground transition data-[hand-active]:border-primary data-[hand-active]:bg-primary/15 data-[hand-focused]:outline data-[hand-focused]:outline-2 data-[hand-focused]:outline-offset-2 data-[hand-focused]:outline-primary/70"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="absolute bottom-[13%] right-[14%] w-72 text-center">
                <div
                  data-hand-transform
                  className="overflow-hidden rounded-xl border bg-card shadow-lg"
                  style={{
                    transform: `scale(${imageTransform.scale}) rotate(${imageTransform.rotation}deg)`,
                    transformOrigin: "center",
                  }}
                >
                  <img
                    src="/gallery/pack-1.png"
                    alt="Abstract gallery artwork used for the two-hand transform test"
                    className="aspect-[4/3] w-full object-cover"
                    draggable={false}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Pinch with both hands over the image · spread and rotate
                </p>
              </div>

              <div className="absolute left-1/2 top-[47%] -translate-x-1/2 text-center">
                <p className="text-sm font-medium">
                  {primary ? gestureLabel(primary.gesture) : "Show a hand"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {dwell.candidate
                    ? `${gestureLabel(dwell.candidate)} dwell ${Math.round(dwell.progress * 100)}%`
                    : "Open palm · thumbs up · point hold"}
                </p>
              </div>
            </div>
          )}
        </section>

        <aside className="overflow-auto border-l p-4">
          <div className="space-y-5 text-xs">
            <div>
              <h2 className="font-medium">Live signal</h2>
              <dl className="mt-2 space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Confidence</dt>
                  <dd className={confidenceColor(confidence)}>{confidence}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Hands</dt>
                  <dd className="font-mono text-foreground">
                    {hands.length}/2
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Primary</dt>
                  <dd>{primary?.handedness ?? "—"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Pinch</dt>
                  <dd>
                    {primary
                      ? `${Math.round(primary.pinchStrength * 100)}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Grab</dt>
                  <dd>
                    {primary
                      ? `${Math.round(primary.grabStrength * 100)}%`
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Frame</dt>
                  <dd>{meanProcessingMs.toFixed(2)}ms</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Uptime</dt>
                  <dd>{Math.floor(trackingUptimeMs / 1000)}s</dd>
                </div>
              </dl>
              <p className="mt-2 text-[10px] text-muted-foreground">
                {confidenceReason}
              </p>
            </div>

            <div>
              <h2 className="font-medium">Confirmed interaction</h2>
              <dl className="mt-2 space-y-1.5 text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Gesture</dt>
                  <dd>{gestureLabel(lastConfirmedGesture)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Target</dt>
                  <dd className="max-w-32 truncate text-foreground">
                    {lastTarget}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Activations</dt>
                  <dd>{activationCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Image scale</dt>
                  <dd>{imageTransform.scale.toFixed(2)}×</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Rotation</dt>
                  <dd>{imageTransform.rotation.toFixed(0)}°</dd>
                </div>
              </dl>
            </div>

            {report && (
              <div className="space-y-2 border-t pt-4">
                <h2 className="font-medium">Protocol result</h2>
                <p>
                  Reliable target:{" "}
                  {report.pinch.smallestReliableTargetPx ?? "none"}px
                </p>
                <p>Pinch hits: {report.pinch.accuracyPercent.toFixed(1)}%</p>
                <p>
                  Drag mean / p95: {report.drag.meanErrorPx.toFixed(1)} /{" "}
                  {report.drag.p95ErrorPx.toFixed(1)}px
                </p>
                <p>Gestures: {report.gestures.accuracyPercent.toFixed(1)}%</p>
                <p>
                  Frame mean / max: {report.performance.meanFrameMs.toFixed(2)}{" "}
                  / {report.performance.maxFrameMs.toFixed(2)}ms
                </p>
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 pt-1 font-medium uppercase text-primary">
                  <span>Tier 1</span>
                  <span>{report.recommendations.tier1Cursor}</span>
                  <span>Tier 2</span>
                  <span>{report.recommendations.tier2Manipulation}</span>
                  <span>Tier 3</span>
                  <span>{report.recommendations.tier3Gestures}</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {phase === "tracking" && (
        <svg
          className="pointer-events-none fixed inset-0 z-40 size-full"
          aria-hidden="true"
        >
          {hands.map((hand) => (
            <g key={hand.key} opacity={hand.confidence >= 0.6 ? 0.9 : 0.4}>
              {HAND_CONNECTIONS.map(([from, to]) => {
                const a = hand.screenLandmarks[from]
                const b = hand.screenLandmarks[to]
                return a && b ? (
                  <line
                    key={`${from}-${to}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                  />
                ) : null
              })}
              {hand.screenLandmarks.map((landmark, index) => (
                <circle
                  key={index}
                  cx={landmark.x}
                  cy={landmark.y}
                  r={index === 8 || index === 4 ? 4 : 2.5}
                  fill={
                    hand.confidence >= 0.6
                      ? "var(--color-primary)"
                      : "transparent"
                  }
                  stroke="var(--color-primary)"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ))}
        </svg>
      )}

      {phase === "tracking" && primary && (
        <div
          className="pointer-events-none fixed z-50 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-primary/70"
          style={{
            left: primary.cursor.x,
            top: primary.cursor.y,
            transform: `translate(-50%, -50%) scale(${0.8 + primary.pinchStrength * 0.25})`,
            background: `conic-gradient(var(--color-primary) ${primary.pinchStrength * 360}deg, transparent 0)`,
            WebkitMask: "radial-gradient(circle, transparent 58%, black 60%)",
            mask: "radial-gradient(circle, transparent 58%, black 60%)",
          }}
          aria-hidden="true"
        />
      )}

      {protocol.phase === "pinch" && pinchTrial && (
        <div
          className="pointer-events-none fixed z-50 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-fuchsia-300 bg-fuchsia-300/15 shadow-[0_0_28px_rgba(240,171,252,0.45)]"
          style={{
            left: pinchTrial.center.x,
            top: pinchTrial.center.y,
            width: pinchTrial.size,
            height: pinchTrial.size,
          }}
        >
          <TargetIcon className="size-4 text-fuchsia-200" />
        </div>
      )}

      {protocol.phase === "drag" && (
        <svg
          className="pointer-events-none fixed inset-0 z-50 size-full"
          aria-hidden="true"
        >
          <polyline
            points={pathPoints}
            fill="none"
            stroke="rgb(240 171 252 / 0.6)"
            strokeWidth="20"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points={pathPoints}
            fill="none"
            stroke="rgb(240 171 252)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {protocol.dragPath[0] && (
            <circle
              cx={protocol.dragPath[0].x}
              cy={protocol.dragPath[0].y}
              r="26"
              fill="rgb(240 171 252 / 0.18)"
              stroke="rgb(240 171 252)"
              strokeWidth="2"
            />
          )}
        </svg>
      )}

      {protocol.phase === "gestures" && gesturePrompt && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-lg border bg-background/95 px-5 py-3 text-center shadow-lg">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Gesture {protocol.gestureIndex + 1}/{protocol.gesturePrompts.length}
          </p>
          <p className="mt-1 text-lg font-semibold">
            {gestureLabel(gesturePrompt)}
          </p>
          <div className="mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${dwell.progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {report && (
        <aside className="fixed inset-x-[10%] bottom-4 z-[60] max-h-[48vh] overflow-auto rounded-xl border bg-background/96 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">HND.1 findings payload</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Add conditions, then copy the measured report into the roadmap
                comment.
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
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
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
              <span>Camera distance</span>
              <input
                className="w-full rounded border bg-background px-2 py-1.5"
                value={observations.cameraDistance}
                onChange={(event) =>
                  setObservations((current) => ({
                    ...current,
                    cameraDistance: event.target.value,
                  }))
                }
                placeholder="arm's length…"
              />
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
                placeholder="occlusion, edge loss…"
              />
            </label>
          </div>
          <textarea
            className="mt-3 h-36 w-full resize-y rounded border bg-muted/30 p-2 font-mono text-[9px]"
            readOnly
            value={findingsJson}
          />
        </aside>
      )}

      <div className="sr-only" aria-live="polite">
        {hands.length} hands detected. {confidenceReason}
      </div>
    </main>
  )
}
