import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision"

import { OneEuroFilter, type OneEuroOptions } from "../gaze/one-euro"
import {
  extractHandFeatures,
  type HandFeatures,
  type Handedness,
} from "./features"

export type HandConfidence = "high" | "low"

export interface HandSample {
  t: number
  hands: HandFeatures[]
  confidence: HandConfidence
  confidenceReason: string | null
  processingMs: number
}

export interface HandEstimator {
  sample(video: HTMLVideoElement, timeMs: number): HandSample
  setFilterOptions(options: OneEuroOptions): void
  close(): void
}

const WASM_PATH = "/mediapipe/wasm"
const MODEL_PATH = "/models/hand_landmarker.task"

class LandmarkSmoother {
  private readonly filters = new Map<string, OneEuroFilter[]>()

  constructor(private options: OneEuroOptions) {}

  setOptions(options: OneEuroOptions) {
    this.options = options
    for (const filters of this.filters.values()) {
      for (const filter of filters) filter.setOptions(options)
    }
  }

  smooth(key: string, landmarks: NormalizedLandmark[], timeMs: number) {
    let filters = this.filters.get(key)
    if (!filters) {
      filters = Array.from(
        { length: landmarks.length * 3 },
        () => new OneEuroFilter(this.options),
      )
      this.filters.set(key, filters)
    }
    return landmarks.map((landmark, index) => ({
      ...landmark,
      x: filters![index * 3]!.filter(landmark.x, timeMs),
      y: filters![index * 3 + 1]!.filter(landmark.y, timeMs),
      z: filters![index * 3 + 2]!.filter(landmark.z, timeMs),
    }))
  }
}

async function createLandmarker(delegate: "GPU" | "CPU") {
  const { FilesetResolver, HandLandmarker } =
    await import("@mediapipe/tasks-vision")
  const files = await FilesetResolver.forVisionTasks(WASM_PATH)
  return HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

export async function createHandEstimator(): Promise<HandEstimator> {
  let landmarker: HandLandmarker
  try {
    landmarker = await createLandmarker("GPU")
  } catch {
    // Safari/WebGL support varies; CPU keeps the protocol available and makes
    // its performance cost visible instead of silently dropping the modality.
    landmarker = await createLandmarker("CPU")
  }

  const smoother = new LandmarkSmoother({
    minCutoff: 1.2,
    beta: 0.015,
    dCutoff: 1,
  })

  return {
    sample(video, timeMs) {
      const startedAt = performance.now()
      const result = landmarker.detectForVideo(video, timeMs)
      const hands = result.landmarks.map((landmarks, index) => {
        const category = result.handedness[index]?.[0]
        const handedness: Handedness =
          category?.categoryName === "Left" ||
          category?.categoryName === "Right"
            ? category.categoryName
            : "Unknown"
        const confidence = category?.score ?? 0
        const smoothed = smoother.smooth(
          `${handedness}-${index}`,
          landmarks,
          timeMs,
        )
        return extractHandFeatures(smoothed, handedness, confidence)
      })

      const bestConfidence = Math.max(
        0,
        ...hands.map((hand) => hand.confidence),
      )
      const confidenceReason =
        hands.length === 0
          ? "No hand found"
          : bestConfidence < 0.6
            ? "Hand identity confidence below 60%"
            : null
      return {
        t: timeMs,
        hands,
        confidence: confidenceReason ? "low" : "high",
        confidenceReason,
        processingMs: performance.now() - startedAt,
      }
    },
    setFilterOptions(options) {
      smoother.setOptions(options)
    },
    close() {
      landmarker.close()
    },
  }
}
