"use client"

// The gaze-capture runtime — mounted once in the shell, owns the camera.
//
// It reuses the GZ.1 spike's proven pipeline wholesale (the same estimator,
// pose calibration, and One-Euro smoothing the lab validated) and changes only
// what the product needs: instead of the lab's fixed panel rects and accuracy
// protocol, it resolves the smoothed gaze point to whatever DOM region opted in
// with `data-gaze-id` (via elementFromPoint), debounces it (GazeRegionDwell),
// and publishes it as advisory attention plus a portrait meet-gaze latch.
//
// Consent is the whole contract: the camera turns on ONLY while the store's
// `enabled` intent is true (the composer's consent toggle), a live indicator is
// always on screen while the hardware runs (no silent capture), and disabling —
// or unmounting — stops the hardware track immediately. Nothing here persists
// or transmits gaze; the only thing that leaves is the region id, and only
// through the same bounded, exclusion-filtered attention payload text chat uses.
//
// Browser-only glue: its load-bearing decisions live in tested pure modules
// (gaze-region, region-dwell, meet-gaze, gaze-attention). David verifies the
// feel in a browser — see the click-list.

import { useCallback, useEffect, useRef, useState } from "react"
import { VideoIcon } from "lucide-react"

import {
  createCalibrationTargets,
  summarizeCalibrationTarget,
  type CalibrationSample,
  type NormalizedCalibrationTarget,
  type ScreenPoint,
} from "@/features/labs/gaze/calibration"
import {
  createGazeEstimator,
  type GazeEstimator,
} from "@/features/labs/gaze/estimator"
import { FixationSettler } from "@/features/labs/gaze/fixation"
import { OneEuroFilter } from "@/features/labs/gaze/one-euro"
import {
  fitPoseCalibrationLayer,
  predictLayeredGaze,
  type PoseCalibrationLayer,
} from "@/features/labs/gaze/pose-calibration"
import {
  GAZE_PORTRAIT_REGION_ID,
  gazeRegionFromElement,
  gazeRegionSelection,
  type GazeRegionDescriptor,
} from "@/lib/gaze/gaze-region"
import { GazeRegionDwell } from "@/lib/gaze/region-dwell"
import {
  advanceMeetGaze,
  initialMeetGazeState,
  type MeetGazeState,
} from "@/lib/gaze/meet-gaze"
import {
  setGazeAcknowledged,
  setGazeCaptureEnabled,
  setGazeCapturePhase,
  setGazeSelection,
  useGazeCaptureEnabled,
  useGazeCapturePhase,
} from "@/lib/gaze/gaze-capture-store"

const CALIBRATION_FRAMES = 24
const FRAME_INTERVAL_MS = 1000 / 30

function clampPoint(point: ScreenPoint): ScreenPoint {
  return {
    x: Math.max(0, Math.min(window.innerWidth, point.x)),
    y: Math.max(0, Math.min(window.innerHeight, point.y)),
  }
}

export function GazeCaptureController() {
  const enabled = useGazeCaptureEnabled()
  const phase = useGazeCapturePhase()

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const estimatorRef = useRef<GazeEstimator | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef(0)

  const layersRef = useRef<PoseCalibrationLayer[]>([])
  const samplesRef = useRef<CalibrationSample[]>([])
  const targetsRef = useRef<NormalizedCalibrationTarget[]>([])
  const targetIndexRef = useRef(0)
  const targetFramesRef = useRef(0)
  const settlerRef = useRef(new FixationSettler())
  const xFilterRef = useRef(new OneEuroFilter())
  const yFilterRef = useRef(new OneEuroFilter())
  const dwellRef = useRef(new GazeRegionDwell())
  const committedRegionRef = useRef<GazeRegionDescriptor | null>(null)
  const meetGazeRef = useRef<MeetGazeState>(initialMeetGazeState())

  const [calibrationTarget, setCalibrationTarget] =
    useState<NormalizedCalibrationTarget | null>(null)

  const release = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    estimatorRef.current?.close()
    estimatorRef.current = null
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    layersRef.current = []
    samplesRef.current = []
    dwellRef.current.reset()
    committedRegionRef.current = null
    meetGazeRef.current = initialMeetGazeState()
    setCalibrationTarget(null)
    setGazeSelection(null)
    setGazeAcknowledged(false)
  }, [])

  // The camera lifecycle is a genuine imperative side effect (getUserMedia,
  // requestAnimationFrame, hardware release) keyed on the consent intent — one
  // of the legitimate uses of useEffect this codebase keeps.
  useEffect(() => {
    if (!enabled) {
      release()
      return
    }

    let cancelled = false

    const commitRegion = (point: ScreenPoint, now: number) => {
      const element = document.elementFromPoint(point.x, point.y)
      const region = gazeRegionFromElement(element)
      const committedId = dwellRef.current.update(region?.id ?? null, now)

      if (committedId === (committedRegionRef.current?.id ?? null)) {
        // no committed change; still advance the meet-gaze latch below
      } else {
        committedRegionRef.current =
          committedId && region?.id === committedId ? region : null
        setGazeSelection(gazeRegionSelection(committedRegionRef.current))
      }

      const onPortrait =
        committedRegionRef.current?.id === GAZE_PORTRAIT_REGION_ID
      const nextMeet = advanceMeetGaze(meetGazeRef.current, { onPortrait, t: now })
      if (nextMeet.acknowledged !== meetGazeRef.current.acknowledged) {
        setGazeAcknowledged(nextMeet.acknowledged)
      }
      meetGazeRef.current = nextMeet
    }

    const frame = (now: number) => {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(frame)
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

      // Calibrating: collect settled frames per target, then fit one layer.
      if (layersRef.current.length === 0) {
        const target = targetsRef.current[targetIndexRef.current]
        if (!target) return
        setCalibrationTarget(target)
        if (sample.confidence !== "high" || !sample.features) return
        if (!settlerRef.current.update(sample.features.values).stable) return

        samplesRef.current.push({
          features: sample.features.values,
          target: {
            x: target[0] * window.innerWidth,
            y: target[1] * window.innerHeight,
          },
        })
        targetFramesRef.current += 1

        if (targetFramesRef.current >= CALIBRATION_FRAMES) {
          if (targetIndexRef.current + 1 >= targetsRef.current.length) {
            const perTarget = targetsRef.current.map((_, index) =>
              summarizeCalibrationTarget(
                samplesRef.current.slice(
                  index * CALIBRATION_FRAMES,
                  (index + 1) * CALIBRATION_FRAMES,
                ),
              ).sample,
            )
            layersRef.current = [fitPoseCalibrationLayer(perTarget)]
            xFilterRef.current.reset()
            yFilterRef.current.reset()
            dwellRef.current.reset()
            setCalibrationTarget(null)
            setGazeCapturePhase("tracking")
            return
          }
          targetIndexRef.current += 1
          targetFramesRef.current = 0
          settlerRef.current.reset()
        }
        return
      }

      // Tracking: predict, smooth, resolve to a region, publish.
      if (!sample.features) return
      const predicted = predictLayeredGaze(
        layersRef.current,
        sample.features.values,
      ).point
      const raw = clampPoint(predicted)
      const point = {
        x: xFilterRef.current.filter(raw.x, now),
        y: yFilterRef.current.filter(raw.y, now),
      }
      commitRegion(point, now)
    }

    const start = async () => {
      setGazeCapturePhase("requesting")
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera unavailable")
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
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (!video) throw new Error("Preview not mounted")
        video.srcObject = stream
        await video.play()
        estimatorRef.current = await createGazeEstimator()
        if (cancelled) {
          release()
          return
        }
        targetsRef.current = createCalibrationTargets()
        targetIndexRef.current = 0
        targetFramesRef.current = 0
        samplesRef.current = []
        layersRef.current = []
        settlerRef.current.reset()
        setGazeCapturePhase("calibrating")
        rafRef.current = requestAnimationFrame(frame)
      } catch {
        release()
        // A blocked/failed camera is not "off" — it is a state the user must
        // see so they can fix the permission. Intent stays flipped off so the
        // control is a retry.
        setGazeCaptureEnabled(false)
        setGazeCapturePhase("denied")
      }
    }

    void start()
    return () => {
      cancelled = true
      release()
    }
  }, [enabled, release])

  if (!enabled) return null

  return (
    <>
      <video
        ref={videoRef}
        className="pointer-events-none fixed size-px opacity-0"
        muted
        playsInline
      />

      {/* No silent capture: while the camera is live, this pill is always on
          screen regardless of scroll — the guarantee that the hardware is
          never on without a visible sign. Primary tone = the app's "active"
          state; it is the same claim the composer control makes, anchored
          where it can't be scrolled away. */}
      <div className="pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2">
        <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary shadow-sm">
          <VideoIcon className="size-3.5" />
          {phase === "calibrating" ? "Calibrating gaze" : "Camera sensing gaze"}
        </span>
      </div>

      {/* One calibration target at a time. Reuses the lab's cyan target so the
          gesture the user already learned in the lab reads identically here;
          motion is none — a still dot to fixate, not decoration. */}
      {calibrationTarget && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${calibrationTarget[0] * 100}%`,
            top: `${calibrationTarget[1] * 100}%`,
          }}
        >
          <div className="grid size-12 place-items-center rounded-full border-2 border-primary bg-primary/15">
            <div className="size-2 rounded-full bg-primary" />
          </div>
          <p className="mt-2 whitespace-nowrap rounded bg-background/90 px-2 py-1 text-center text-[11px] text-muted-foreground">
            Look at the dot
          </p>
        </div>
      )}
    </>
  )
}
