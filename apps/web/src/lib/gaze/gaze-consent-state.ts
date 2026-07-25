// The gaze-capture consent control's states and what each one looks like.
//
// A pure presentation module beside `voice-conversation-state`, for the same
// reason and with the same discipline: gaze capture is a camera the user turns
// on, exactly as intimate as the mic, so its control must be as explicit,
// visible, and reversible as the mic's — no always-watching default, and no
// silent live state. What differs from the binary voice toggle is that turning
// on a camera has a real lifecycle (permission, calibration) the user must be
// able to read, so this is a small phase machine rather than on/off.
//
// Design contract for the tones — one palette, each color meaning one thing,
// the same things it means everywhere else in the app:
//   • primary   → live and sharing (the app's single "active/on" tone)
//   • muted     → resting / off
//   • destructive → blocked (the app's single error/danger tone)
// No fourth color; the phase word carries the between-states, not a new hue.
//
// Pure: no DOM, no React, no camera.

export const GAZE_CAPTURE_PHASES = [
  "off",
  "requesting",
  "calibrating",
  "tracking",
  "denied",
] as const

export type GazeCapturePhase = (typeof GAZE_CAPTURE_PHASES)[number]

export interface GazeCapturePresentation {
  readonly phase: GazeCapturePhase
  /** What clicking does now. Turning capture off is always one action. */
  readonly action: "enable" | "disable"
  /** Accessible name and tooltip. Honest about what the camera senses — that
   *  it reads which region you look at, on-device — never just the feature
   *  name. This is the consent copy. */
  readonly label: string
  /** Shown beside the glyph only while the camera is live. A readout that
   *  appears only when something real is happening is information; a permanent
   *  one would be decoration. */
  readonly readout?: string
  /** True whenever the camera hardware is active — drives the always-visible
   *  live indicator so there is no silent capture. */
  readonly live: boolean
  readonly tone: "muted" | "primary" | "destructive"
}

const PRESENTATION: Record<GazeCapturePhase, GazeCapturePresentation> = {
  off: {
    phase: "off",
    action: "enable",
    label:
      "Share your gaze — turns on the camera to sense which panel you're looking at, on this device only",
    live: false,
    tone: "muted",
  },
  requesting: {
    phase: "requesting",
    action: "disable",
    label: "Starting the camera — allow it to sense your gaze",
    readout: "Starting",
    live: true,
    tone: "primary",
  },
  calibrating: {
    phase: "calibrating",
    action: "disable",
    label: "Calibrating gaze — follow the targets, then it starts sensing",
    readout: "Calibrating",
    live: true,
    tone: "primary",
  },
  tracking: {
    phase: "tracking",
    action: "disable",
    label:
      "Gaze sharing on — the camera senses which panel you look at and adds it to the agent's context; turn off",
    readout: "Gaze",
    live: true,
    tone: "primary",
  },
  denied: {
    phase: "denied",
    action: "enable",
    label: "Camera blocked — allow it in your browser to share gaze",
    live: false,
    tone: "destructive",
  },
}

export function gazeCapturePresentation(
  phase: GazeCapturePhase,
): GazeCapturePresentation {
  return PRESENTATION[phase]
}
