import type { FaceLandmarker } from "@mediapipe/tasks-vision"

import { extractGazeFeatures, type ExtractedGazeFeatures } from "./features"

export type GazeConfidence = "high" | "low"

export interface GazeSample {
  t: number
  features: ExtractedGazeFeatures | null
  confidence: GazeConfidence
  confidenceReason: string | null
  processingMs: number
}

export interface GazeEstimator {
  sample(video: HTMLVideoElement, timeMs: number): GazeSample
  close(): void
}

const WASM_PATH = "/mediapipe/wasm"
const MODEL_PATH = "/models/face_landmarker.task"
const MIN_EYE_OPENNESS = 0.12
const MAX_HEAD_YAW_DEGREES = 25

async function createLandmarker(delegate: "GPU" | "CPU") {
  const { FaceLandmarker, FilesetResolver } =
    await import("@mediapipe/tasks-vision")
  const files = await FilesetResolver.forVisionTasks(WASM_PATH)
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: MODEL_PATH,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true,
  })
}

export async function createGazeEstimator(): Promise<GazeEstimator> {
  let landmarker: FaceLandmarker
  try {
    landmarker = await createLandmarker("GPU")
  } catch {
    // Safari/WebGL combinations vary. CPU is slower but keeps the spike honest
    // and gives the performance protocol a real number instead of no result.
    landmarker = await createLandmarker("CPU")
  }

  return {
    sample(video, timeMs) {
      const startedAt = performance.now()
      const result = landmarker.detectForVideo(video, timeMs)
      const landmarks = result.faceLandmarks[0]
      const matrix = result.facialTransformationMatrixes[0]

      if (!landmarks || !matrix) {
        return {
          t: timeMs,
          features: null,
          confidence: "low",
          confidenceReason: "Face not found",
          processingMs: performance.now() - startedAt,
        }
      }

      const features = extractGazeFeatures(landmarks, matrix)
      const [rightOpenness, leftOpenness] = features.eyeOpenness
      let confidenceReason: string | null = null
      if (rightOpenness < MIN_EYE_OPENNESS || leftOpenness < MIN_EYE_OPENNESS) {
        confidenceReason = "Eyes closed or obscured"
      } else if (Math.abs(features.headPose.yaw) > MAX_HEAD_YAW_DEGREES) {
        confidenceReason = "Head turned more than 25°"
      }

      return {
        t: timeMs,
        features,
        confidence: confidenceReason ? "low" : "high",
        confidenceReason,
        processingMs: performance.now() - startedAt,
      }
    },
    close() {
      landmarker.close()
    },
  }
}
