// P2 RISK GATE — can the realtime side be prevented from independently
// answering while another agent (Eve) owns the turn?
//
// The P2 design in docs/specs/LIVE-VOICE-HARNESS-ASSESSMENT-20260725.md only
// works if a committed user utterance produces NO realtime answer until the
// client explicitly calls thread/realtime/appendSpeech. The documented lever is
// `clientManagedHandoffs: true` — "Leaves Codex response handoffs to the
// client's explicit append calls instead of forwarding them automatically."
//
// This probe drives the raw NDJSON app-server protocol (the production client
// in apps/agent/agent/lib/realtime-appserver.ts cannot set the flag) and
// establishes a REAL WebRTC call with a real audio track, because:
//
//   * the websocket transport is refused on a subscription login
//     ("realtime conversation requires API key auth" — reproduce with
//     GATE_TRANSPORT=websocket), so WebRTC is the only live path here;
//   * in WebRTC mode codex still opens a sideband control websocket and runs
//     the same input task, so every realtime transcript is projected onto
//     stdio as thread/realtime/transcript/* — we can hear the model both
//     ways (stdio transcripts AND inbound RTP on the peer connection).
//
// Phases:
//   1. GREETING   — call is live, we send only silence. Any model output here
//                   is speech nobody handed it.
//   2. UTTERANCE  — speak a real synthesized question (macOS `say` -> ffmpeg
//                   Ogg/Opus -> RTP) and let server VAD commit the turn.
//   3. WATCH      — any assistant transcript or inbound audio in this window
//                   is the realtime model answering on its own -> GATE FAILS.
//   4. CONTROL    — call appendSpeech and confirm output DOES appear, so
//                   "silence" above cannot be a blind probe.
//
// NOT CI-safe: needs network, a `codex login` session, macOS `say`, ffmpeg,
// a codex binary >= 0.146.0-alpha, and werift (not a repo dependency):
//
//   mkdir -p /tmp/realtime-gate && cd /tmp/realtime-gate && npm i werift
//   GATE_WERIFT_DIR=/tmp/realtime-gate \
//   SIGIL_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex \
//     node docs/specs/evidence/realtime-handoff-gate.mjs
//
// Env knobs:
//   GATE_CLIENT_MANAGED_HANDOFFS=true|false  (default true — the lever under test)
//   GATE_PROMPT=silent|default               (default silent — also instruct the
//                                             frontend model to stay quiet)
//   GATE_TRANSPORT=webrtc|websocket          (default webrtc)
//   GATE_GREETING_MS / GATE_WATCH_MS / GATE_CONTROL_MS
//
// ============================ RESULT: GATE FAILS ============================
// Run live 2026-07-25, codex 0.146.0-alpha, subscription OAuth, realtime v3.
//
//   clientManagedHandoffs=true, prompt=silent
//     control   :  93 speech pkts — assistant: " Here is the sentence you asked for."
//     greeting  :   0 speech pkts  (correctly silent while we send only silence)
//     utterance :   0 speech pkts
//     watch     : 213 speech pkts — user: " Hello there. Can you tell me what you
//                 are able to see right now" -> assistant, UNPROMPTED:
//                 " I don't actually see anything at all. I don't have eyes or a camera."
//
//   clientManagedHandoffs=false, prompt=silent  (contrast)
//     control 696 / greeting 582 / utterance 164 / watch 190 speech pkts — the
//     model also chatters continuously, and still answers the user itself.
//
// So `clientManagedHandoffs: true` does change behavior — it stops the Codex
// backend's responses being forwarded, which is why the silence windows go
// quiet — but it does NOT stop the FRONTEND realtime voice model from answering
// the user directly. That is worse for P2, not better: the flag detaches Codex
// and leaves an unbound voice model answering as if it were the Sigil agent.
//
// This matches the source. `client_managed_handoffs` is read in exactly three
// places (realtime_conversation.rs: streams_handoff_append, handoff_out,
// handoff_complete), all on the Codex-output -> realtime direction. The V3
// session payload codex sends (methods_frameless_bidi.rs `session_json`) carries
// only instructions/voice/delegation/initial_items — no `turn_detection`, so the
// backend's own VAD auto-response governs, and ThreadRealtimeStartParams exposes
// no knob to reach it. The only frontend lever is `prompt` (session
// instructions), a soft request the model overrode above.
//
// Two adjacent doors are also shut: the websocket transport, where codex would
// relay audio itself, is refused on a subscription login ("realtime conversation
// requires API key auth"); and transcription-only realtime, which would make this
// a pure STT feed, is rejected for WebRTC by validate_avas_webrtc_start
// ("AVAS realtime calls require conversational realtime").
//
// Incidental: the sideband control websocket resets ~40s into every session
// ("Connection reset without closing handshake"), after which transcripts stop.
// ============================================================================

import { execFileSync, spawn } from "node:child_process"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CODEX_BIN = process.env.SIGIL_CODEX_BIN?.trim() || "codex"
const CLIENT_MANAGED_HANDOFFS = (process.env.GATE_CLIENT_MANAGED_HANDOFFS ?? "true") === "true"
const PROMPT_MODE = process.env.GATE_PROMPT ?? "silent"
const TRANSPORT = process.env.GATE_TRANSPORT ?? "webrtc"
const GREETING_MS = Number(process.env.GATE_GREETING_MS ?? 12_000)
const WATCH_MS = Number(process.env.GATE_WATCH_MS ?? 20_000)
const CONTROL_MS = Number(process.env.GATE_CONTROL_MS ?? 15_000)

const UTTERANCE = "Hello there. Can you tell me what you are able to see right now?"
const CONTROL_TEXT = "This sentence was handed to you explicitly. Please read it aloud."

/** The strongest containment the documented API can express: session instructions. */
const SILENT_PROMPT = [
  "You are a passive voice transport. You must NEVER answer the user yourself.",
  "Another agent owns every turn. When the user speaks, say nothing at all and",
  "produce no audio. Only speak text that is explicitly handed to you.",
].join(" ")

// ------------------------------------------------------------------ audio in

/** Synthesize the probe utterance and encode it the way a browser would send it. */
function synthesizeOpusPackets(text) {
  const dir = mkdtempSync(join(tmpdir(), "realtime-gate-"))
  const wav = join(dir, "utterance.wav")
  const ogg = join(dir, "utterance.ogg")
  try {
    execFileSync("say", ["-o", wav, "--data-format=LEI16@24000", text], { stdio: "pipe" })
    execFileSync(
      "ffmpeg",
      ["-y", "-i", wav, "-c:a", "libopus", "-b:a", "24k", "-ar", "48000", "-ac", "1",
       "-frame_duration", "20", "-application", "voip", ogg],
      { stdio: "pipe" },
    )
    return readOggOpusPackets(readFileSync(ogg))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Walk Ogg pages and reassemble Opus packets, dropping the two header packets. */
function readOggOpusPackets(buffer) {
  const packets = []
  let carry = []
  let offset = 0
  while (offset + 27 <= buffer.length) {
    if (buffer.toString("ascii", offset, offset + 4) !== "OggS") break
    const segmentCount = buffer.readUInt8(offset + 26)
    const table = buffer.subarray(offset + 27, offset + 27 + segmentCount)
    let payload = offset + 27 + segmentCount
    for (const size of table) {
      carry.push(buffer.subarray(payload, payload + size))
      payload += size
      if (size < 255) {
        packets.push(Buffer.concat(carry))
        carry = []
      }
    }
    offset = payload
  }
  // OpusHead + OpusTags are container metadata, not audio.
  return packets.filter((p) => {
    const tag = p.toString("ascii", 0, 8)
    return tag !== "OpusHead" && tag !== "OpusTags"
  })
}

/** 20ms of Opus silence — keeps the RTP stream continuous between phases. */
const SILENCE_PACKET = Buffer.from([0xf8, 0xff, 0xfe])

// ------------------------------------------------------------------ transport

const child = spawn(
  CODEX_BIN,
  ["app-server", "--stdio", "-c", "features.realtime_conversation=true", "-c", "mcp_servers={}"],
  { stdio: ["pipe", "pipe", "pipe"] },
)

let nextId = 1
const pending = new Map()
const startedAt = Date.now()

function log(kind, detail) {
  const at = Date.now() - startedAt
  console.log(`[+${String(at).padStart(6)}ms] ${kind}${detail ? `: ${detail}` : ""}`)
}

child.stderr.on("data", (d) => {
  const text = String(d)
  // codex logs a lot at startup; only surface realtime failures.
  if (/realtime|ERROR/i.test(text)) log("stderr", text.trim().slice(0, 240))
})

function request(method, params) {
  const id = nextId++
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
  return new Promise((resolve, reject) => {
    pending.set(id, { method, resolve, reject })
  })
}

const notificationHandlers = new Set()
let buffer = ""
child.stdout.on("data", (chunk) => {
  buffer += String(chunk)
  let newline = buffer.indexOf("\n")
  while (newline >= 0) {
    const line = buffer.slice(0, newline)
    buffer = buffer.slice(newline + 1)
    newline = buffer.indexOf("\n")
    if (!line.trim()) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof message.method === "string" && message.id === undefined) {
      for (const handler of [...notificationHandlers]) {
        handler({ method: message.method, params: message.params ?? {} })
      }
      continue
    }
    const entry = pending.get(message.id)
    if (!entry) continue
    pending.delete(message.id)
    if (message.error) {
      entry.reject(new Error(`${entry.method} failed: ${message.error.message ?? JSON.stringify(message.error)}`))
    } else {
      entry.resolve(message.result ?? {})
    }
  }
})

// ----------------------------------------------------------------- observation

/** Everything the realtime model emitted, tagged with the phase it landed in. */
const observations = []
let phase = "startup"

notificationHandlers.add(({ method, params }) => {
  if (!method.startsWith("thread/realtime/")) return
  if (method === "thread/realtime/transcript/delta") return // `done` is the settled signal
  if (method === "thread/realtime/transcript/done") {
    observations.push({ kind: "transcript", phase, role: params.role, text: params.text })
    log(`transcript[${params.role}]`, JSON.stringify(params.text ?? "").slice(0, 220))
    return
  }
  if (method === "thread/realtime/outputAudio/delta") {
    countAudio("outputAudioNotification")
    return
  }
  if (method === "thread/realtime/sdp") return // handled by the waiter
  log(method.replace("thread/realtime/", ""), JSON.stringify(params).slice(0, 200))
})

/** Inbound media, bucketed by phase — the model's voice arrives here. */
const inboundBytes = {}
const inboundSpeechPackets = {}

function countAudio(kind) {
  const last = observations[observations.length - 1]
  if (last?.kind === kind && last.phase === phase) {
    last.count += 1
    return
  }
  observations.push({ kind, phase, count: 1 })
  log("MODEL AUDIO", `${kind} phase=${phase}`)
}

/** A phase "has model speech" if we received a meaningful run of voice packets. */
const SPEECH_PACKET_FLOOR = 25 // 0.5s of 20ms frames — past any handshake blip
function spokeIn(targetPhase) {
  return (inboundSpeechPackets[targetPhase] ?? 0) >= SPEECH_PACKET_FLOOR
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Model output = assistant transcript, or audio the model sent us. */
function modelOutputIn(targetPhase) {
  return observations.filter(
    (o) =>
      o.phase === targetPhase &&
      (o.kind !== "transcript" || (o.role !== "user" && (o.text ?? "").trim() !== "")),
  )
}

// --------------------------------------------------------------------- webrtc

async function openWebrtc() {
  const requireFrom = createRequire(
    process.env.GATE_WERIFT_DIR ? `${process.env.GATE_WERIFT_DIR}/index.js` : import.meta.url,
  )
  const { RTCPeerConnection, MediaStreamTrack, RtpPacket, RtpHeader, RTCRtpCodecParameters } =
    requireFrom("werift")

  // Opus only — the same single-codec offer a realtime voice client sends.
  const pc = new RTCPeerConnection({
    codecs: {
      audio: [
        new RTCRtpCodecParameters({
          mimeType: "audio/opus",
          clockRate: 48_000,
          channels: 2,
          payloadType: 111,
          parameters: "minptime=10;useinbandfec=1",
        }),
      ],
    },
  })
  const track = new MediaStreamTrack({ kind: "audio" })
  const transceiver = pc.addTransceiver(track, { direction: "sendrecv" })

  pc.onTrack.subscribe((remote) => {
    remote.onReceiveRtp.subscribe((rtp) => {
      // Opus DTX/comfort-noise frames are a few bytes; real speech is not.
      inboundBytes[phase] = (inboundBytes[phase] ?? 0) + rtp.payload.length
      if (rtp.payload.length > 10) {
        inboundSpeechPackets[phase] = (inboundSpeechPackets[phase] ?? 0) + 1
      }
    })
  })

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  let sequence = Math.floor(Math.random() * 30_000)
  let timestamp = Math.floor(Math.random() * 100_000)
  const sendPacket = (payload) => {
    const header = new RtpHeader({
      sequenceNumber: sequence++ % 65_536,
      timestamp: (timestamp += 960) % 4_294_967_296,
      payloadType: 111,
      ssrc: track.ssrc,
      marker: false,
    })
    track.writeRtp(new RtpPacket(header, payload))
  }

  return {
    sdp: pc.localDescription.sdp,
    async accept(answerSdp) {
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp })
    },
    connected: () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WebRTC never connected")), 30_000)
        const check = () => {
          if (pc.connectionState === "connected") {
            clearTimeout(timer)
            resolve()
          }
        }
        pc.connectionStateChange.subscribe(check)
        check()
      }),
    sendPacket,
    inboundAudioPackets: () => inboundAudioPackets,
    close: () => pc.close().catch(() => {}),
    transceiver,
  }
}

/** Continuous 20ms RTP so the far end always has a live inbound stream. */
function startPacing(call) {
  let queue = []
  const timer = setInterval(() => {
    call.sendPacket(queue.length > 0 ? queue.shift() : SILENCE_PACKET)
  }, 20)
  return {
    speak(packets) {
      queue = queue.concat(packets)
      return sleep(packets.length * 20 + 500)
    },
    stop: () => clearInterval(timer),
  }
}

// ----------------------------------------------------------------------- main

async function main() {
  const opusPackets = synthesizeOpusPackets(UTTERANCE)
  log("audio", `${opusPackets.length} opus packets (~${(opusPackets.length * 20) / 1000}s of speech)`)

  await request("initialize", {
    clientInfo: { name: "sigil-handoff-gate", title: "sigil handoff gate", version: "0.0.1" },
    capabilities: { experimentalApi: true },
  })
  const thread = await request("thread/start", {})
  const threadId = thread.threadId ?? thread.thread?.id
  if (!threadId) throw new Error("thread/start returned no thread id")
  log("thread", threadId)

  const call = TRANSPORT === "webrtc" ? await openWebrtc() : undefined

  const startParams = {
    threadId,
    version: "v3",
    outputModality: "audio",
    includeStartupContext: false,
    clientManagedHandoffs: CLIENT_MANAGED_HANDOFFS,
    ...(call ? { transport: { type: "webrtc", sdp: call.sdp } } : {}),
  }
  if (PROMPT_MODE === "silent") startParams.prompt = SILENT_PROMPT
  log("start params", JSON.stringify({ ...startParams, threadId: "<thread>", transport: call ? "<webrtc offer>" : undefined }))

  const sessionReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for realtime start")), 60_000)
    notificationHandlers.add(function onStart(notification) {
      if (notification.method === "thread/realtime/sdp") {
        clearTimeout(timer)
        notificationHandlers.delete(onStart)
        resolve(notification.params.sdp)
      } else if (notification.method === "thread/realtime/error") {
        clearTimeout(timer)
        notificationHandlers.delete(onStart)
        reject(new Error(`realtime error: ${JSON.stringify(notification.params)}`))
      }
    })
  })

  await request("thread/realtime/start", startParams)
  const answerSdp = await sessionReady
  log("answer sdp", `${answerSdp.split("\r\n")[0]} (${answerSdp.length} bytes)`)

  if (!call) throw new Error("websocket transport produced no live call; rerun with GATE_TRANSPORT=webrtc")
  await call.accept(answerSdp)
  await call.connected()
  log("PHASE", "WebRTC connected")
  const pacer = startPacing(call)

  try {
    // The control runs FIRST so a later silence is trustworthy: we prove the
    // probe can hear the model before we conclude anything from not hearing it.
    phase = "control"
    log("PHASE", "positive control — explicit appendSpeech (proves we can hear the model)")
    await request("thread/realtime/appendSpeech", { threadId, text: CONTROL_TEXT })
    await sleep(CONTROL_MS)

    phase = "greeting"
    log("PHASE", `greeting window (${GREETING_MS}ms) — sending silence only`)
    await sleep(GREETING_MS)

    phase = "utterance"
    log("PHASE", "speaking the probe utterance")
    await pacer.speak(opusPackets)

    phase = "watch"
    log("PHASE", `watch window (${WATCH_MS}ms) — model output here answers the gate`)
    await sleep(WATCH_MS)

    report()
  } finally {
    pacer.stop()
    phase = "done"
    await request("thread/realtime/stop", { threadId }).catch(() => {})
    call.close()
  }
}

function describe(o) {
  if (o.kind === "transcript") return `[${o.phase}] transcript(${o.role}) ${JSON.stringify(o.text).slice(0, 200)}`
  return `[${o.phase}] ${o.kind} x${o.count}`
}

function report() {
  console.log("\n================ GATE RESULT ================")
  console.log(`transport             : ${TRANSPORT}`)
  console.log(`clientManagedHandoffs : ${CLIENT_MANAGED_HANDOFFS}`)
  console.log(`session prompt        : ${PROMPT_MODE}`)
  console.log("\ninbound model voice by phase (speech packets / total payload bytes):")
  for (const name of ["control", "greeting", "utterance", "watch"]) {
    console.log(
      `   ${name.padEnd(10)} ${String(inboundSpeechPackets[name] ?? 0).padStart(5)} pkts  ${String(inboundBytes[name] ?? 0).padStart(7)} bytes`,
    )
  }
  const transcripts = observations.filter((o) => o.kind === "transcript")
  console.log(`\ntranscript notifications (${transcripts.length}):`)
  for (const o of transcripts) console.log(`   - ${describe(o)}`)

  const controlSpoke = spokeIn("control")
  const unsolicited = ["greeting", "utterance", "watch"].filter(spokeIn)

  if (!controlSpoke) {
    console.log("\nVERDICT: INCONCLUSIVE — the positive control produced no model speech, so")
    console.log("this probe cannot distinguish 'the model stayed silent' from 'the probe")
    console.log("hears nothing'. Fix the control before trusting any silence below.")
    process.exitCode = 3
    return
  }
  if (unsolicited.length > 0) {
    console.log(`\nVERDICT: GATE FAILS — the realtime model spoke on its own (phases: ${unsolicited.join(", ")})`)
    console.log("with clientManagedHandoffs set. It cannot be prevented from independently")
    console.log("answering, so Eve cannot own the turn on this transport.")
    process.exitCode = 1
    return
  }
  console.log("\nVERDICT: GATE PASSES — the model spoke only text handed to it explicitly and")
  console.log("stayed silent through a spoken user utterance.")
  process.exitCode = 0
}

main()
  .catch((error) => {
    console.log(`\nPROBE ERROR: ${error.message}`)
    process.exitCode = 2
  })
  .finally(() => {
    child.kill("SIGTERM")
    setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref()
  })
