// COORDINATOR-TOOL-REACH GATE — does the realtime voice COORDINATOR, given a
// real tool surface, actually INVOKE a tool for a user request and let the
// result reach what it speaks?
//
// This is the RE-FRAMED question. The earlier realtime-handoff-gate.mjs asked
// "can the realtime model be kept SILENT so Eve answers instead" and proved it
// cannot. David's architecture makes that self-answering the FEATURE: the
// realtime model is a personal COORDINATOR that speaks on its own AND delegates
// to tools/agents and speaks their results. So the new gate is whether the
// delegation edge actually carries a real tool.
//
// SOURCE MODEL (codex 322d5b9 / codex-cli 0.146.0-alpha.3.1):
//   * ThreadRealtimeStartParams has NO tools/mcp field. Tools live on the
//     app-server's `mcp_servers` config, reached via the frontend DELEGATING.
//   * frontend voice model -> RealtimeEvent::HandoffRequested -> core
//     `route_realtime_text_input(text)` -> `Op::UserInput` = a NORMAL Session
//     turn (session/mod.rs:1193), which runs the full turn machinery WITH the
//     configured MCP tools. Backend output streams back via
//     send_conversation_function_call_output, BEM-routed (analysis/commentary/
//     final), and the frontend speaks it.
//   * What the app-server projects to us (bespoke_event_handling.rs:418+):
//     transcript/{delta,done} (role user|assistant), and itemAdded of type
//     `handoff_request` (handoff_id + input_transcript) and raw
//     ConversationItemAdded items.
//
// PROOF (positive-control-first, so a negative reading is trustworthy):
//   Q1 TOOL REACH — configure mcp_servers with a stdio server exposing ONE
//   `lookup` tool that returns a per-run SENTINEL and logs every call. Speak/
//   type a request that needs it. Two independent proofs it was reached:
//     (a) out-of-band: the MCP log records a tools/call;
//     (b) in-band: the SENTINEL (unknowable without the tool) appears in an
//         ASSISTANT transcript = the tool output reached spoken output.
//   Q2 HANDOFF SEPARATION — with codexResponseHandoffMode=bemTags and custom
//   channel prefixes, observe whether coordinator delegation vs delegated
//   result are distinguishable on the wire (handoff_request items + prefixes).
//
// NOT CI-safe: needs network, a `codex login` session, macOS `say`, ffmpeg, a
// codex binary >= 0.146.0-alpha, and werift (not a repo dep):
//
//   SP=<scratchpad>; ( cd "$SP/werift-host" && npm i werift )
//   GATE_WERIFT_DIR="$SP/werift-host" \
//   SIGIL_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex \
//     node docs/specs/evidence/coordinator-tool-gate.mjs
//
// Env knobs:
//   GATE_HANDOFF_MODE=bemTags|thinking|commentary  (default bemTags)
//   GATE_CONTROL_MS / GATE_WATCH_MS
//
// ============================ RESULT: GATE PASSES ===========================
// Run live 2026-07-25, codex-cli 0.146.0-alpha.3.1, subscription OAuth,
// realtime v3 / WebRTC, isolated CODEX_HOME (single `lookup` tool).
//
//   positive control : 111 speech pkts — assistant " Sure thing. What's on your mind?"
//   delegation edge  : handoff_request item, input_transcript = the spoken/typed
//                      request ("Please call the lookup tool to fetch the current
//                      secret passphrase. Then tell me the passphrase out loud")
//   tool reach (OOB) : MCP log recorded `tools/call name=lookup` + TOOL-INVOKED
//   tool reach (in-band): assistant transcript " Got it. The passphrase is
//                      SIGIL-U3EFOB-HHJ7K6." — the per-run sentinel is unknowable
//                      without calling the tool, so the tool output reached speech.
//   progress vs final: " Checking the lookup tool now." then " Got it. ..." —
//                      discrete assistant transcript/done events.
//
// So the realtime voice model, given a real tool surface, DELEGATES to the
// backend, the backend CALLS the MCP tool, and the result reaches spoken output.
// This is the coordinator David wants; the earlier P2 "keep it silent" gate
// asked the wrong question.
//
// Q2 nuance: the delegation edge (handoff_request) and per-utterance transcript
// events ARE visible to the app-server client, so "coordinator is delegating"
// and interim-vs-final utterances are distinguishable. The LITERAL BEM channel
// prefixes ([THINKING]/[PROGRESS]/[DONE]) we configured did NOT appear as tags
// in the transcripts — the frontend consumes BEM routing internally and speaks
// natural language. The clean lever for explicit machine-readable progress/final
// labels is `codexResponsesAsItems=true` + `codexResponseItemPrefix` (protocol
// v2/realtime.rs), which delivers backend responses as ConversationItemAdded
// items to the client instead of folding them into speech — source-identified,
// not yet live-run here.
//
// The ~32s realtime-websocket reset defect (documented in realtime-handoff-gate)
// still bites: front-load the request so the tool round-trip completes inside
// the window (this run finished at +25.6s).
// ============================================================================

import { execFileSync, spawn } from "node:child_process"
import { createRequire } from "node:module"
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  copyFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const CODEX_BIN = process.env.SIGIL_CODEX_BIN?.trim() || "codex"
const HANDOFF_MODE = process.env.GATE_HANDOFF_MODE ?? "bemTags"
// Short control — the earlier run proved the audio-return path (687 pkts); the
// scarce resource now is the ~32s window before the realtime websocket resets,
// so we front-load the real request instead of spending it on a long control.
const CONTROL_MS = Number(process.env.GATE_CONTROL_MS ?? 3_000)
const WATCH_MS = Number(process.env.GATE_WATCH_MS ?? 30_000)

// A sentinel the model cannot possibly produce unless it called `lookup`.
const SENTINEL = `SIGIL-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Math.random()
  .toString(36)
  .slice(2, 8)
  .toUpperCase()}`
const MCP_PATH = join(HERE, "coordinator-tool-mcp.mjs")
const MCP_LOG = join(mkdtempSync(join(tmpdir(), "coord-tool-")), "mcp.log")
writeFileSync(MCP_LOG, "") // create it so existence checks are simple

const CONTROL_TEXT = "This control sentence was handed to you directly."
const REQUEST =
  "Please call the lookup tool to fetch the current secret passphrase, then tell me the passphrase out loud."

// custom prefixes so we can tell coordinator chatter from delegated result on the wire
const CHANNEL_PREFIXES = {
  analysis: ["[THINKING]"],
  commentary: ["[PROGRESS]", "[UPDATE]"],
  final: ["[DONE]"],
}

const startedAt = Date.now()
function log(kind, detail) {
  const at = Date.now() - startedAt
  console.log(`[+${String(at).padStart(6)}ms] ${kind}${detail ? `: ${detail}` : ""}`)
}

// --------------------------------------------------------------- audio synth
function synthesizeOpusPackets(text) {
  const dir = mkdtempSync(join(tmpdir(), "coord-audio-"))
  const wav = join(dir, "u.wav")
  const ogg = join(dir, "u.ogg")
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
  return packets.filter((p) => {
    const tag = p.toString("ascii", 0, 8)
    return tag !== "OpusHead" && tag !== "OpusTags"
  })
}
const SILENCE_PACKET = Buffer.from([0xf8, 0xff, 0xfe])

// --------------------------------------------------------------- app-server
// Isolated CODEX_HOME so the backend's tool surface is EXACTLY one tool
// (`lookup`). The real ~/.codex loads ~50 gonk MCP tools, whose startup and
// selection latency ran past the ~32s websocket-reset window last run. We keep
// the real auth so subscription OAuth still works.
const CODEX_HOME = mkdtempSync(join(tmpdir(), "coord-home-"))
const realHome = join(homedir(), ".codex")
for (const f of ["auth.json", "version.json"]) {
  const src = join(realHome, f)
  if (existsSync(src)) {
    try {
      symlinkSync(src, join(CODEX_HOME, f))
    } catch {
      copyFileSync(src, join(CODEX_HOME, f))
    }
  }
}
writeFileSync(
  join(CODEX_HOME, "config.toml"),
  [
    `approval_policy = "never"`,
    `sandbox_mode = "danger-full-access"`,
    ``,
    `[features]`,
    `realtime_conversation = true`,
    ``,
    `[mcp_servers.probe]`,
    `command = "node"`,
    `args = ["${MCP_PATH}"]`,
    `default_tools_approval_mode = "auto"`,
    `startup_timeout_sec = 25`,
    `env = { PROBE_SENTINEL = "${SENTINEL}", PROBE_MCP_LOG = "${MCP_LOG}" }`,
    ``,
  ].join("\n"),
)

const args = ["app-server", "--stdio"]
log("config", `sentinel=${SENTINEL} mcpLog=${MCP_LOG}`)
log("config", `CODEX_HOME=${CODEX_HOME} (isolated, single tool)`)

const child = spawn(CODEX_BIN, args, {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, CODEX_HOME },
})
let nextId = 1
const pending = new Map()
function request(method, params) {
  const id = nextId++
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
  return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }))
}
function respond(id, result) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`)
}

child.stderr.on("data", (d) => {
  const text = String(d)
  if (/realtime|ERROR|mcp|tool|approv|elicit/i.test(text)) log("stderr", text.trim().slice(0, 240))
})

const notificationHandlers = new Set()
const serverRequests = [] // server->client requests we auto-answered
let buffer = ""
child.stdout.on("data", (chunk) => {
  buffer += String(chunk)
  let nl = buffer.indexOf("\n")
  while (nl >= 0) {
    const line = buffer.slice(0, nl)
    buffer = buffer.slice(nl + 1)
    nl = buffer.indexOf("\n")
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    // server -> client REQUEST (has method AND id): auto-approve anything so a
    // tool-call approval/elicitation can never stall the turn.
    if (typeof msg.method === "string" && msg.id !== undefined) {
      serverRequests.push({ method: msg.method, params: msg.params })
      log("SERVER-REQUEST", `${msg.method} ${JSON.stringify(msg.params ?? {}).slice(0, 200)}`)
      respond(msg.id, approvalResultFor(msg.method))
      continue
    }
    if (typeof msg.method === "string") {
      for (const h of [...notificationHandlers]) h({ method: msg.method, params: msg.params ?? {} })
      continue
    }
    const entry = pending.get(msg.id)
    if (!entry) continue
    pending.delete(msg.id)
    if (msg.error) entry.reject(new Error(`${entry.method} failed: ${msg.error.message ?? JSON.stringify(msg.error)}`))
    else entry.resolve(msg.result ?? {})
  }
})

// Best-effort permissive answer to any approval/elicitation request shape.
function approvalResultFor(method) {
  const m = method.toLowerCase()
  if (m.includes("approv")) return { decision: "approved" }
  if (m.includes("elicit")) return { action: "accept", content: {} }
  return {}
}

// --------------------------------------------------------------- observation
const transcripts = [] // {phase, role, text}
const items = [] // raw itemAdded items {phase, item}
const inboundSpeechPackets = {}
const inboundBytes = {}
let phase = "startup"

notificationHandlers.add(({ method, params }) => {
  if (!method.startsWith("thread/realtime/")) return
  const short = method.replace("thread/realtime/", "")
  if (short === "transcript/delta") return
  if (short === "transcript/done") {
    transcripts.push({ phase, role: params.role, text: params.text ?? "" })
    log(`transcript[${params.role}]`, JSON.stringify(params.text ?? "").slice(0, 240))
    return
  }
  if (short === "itemAdded") {
    items.push({ phase, item: params.item })
    log("itemAdded", JSON.stringify(params.item ?? {}).slice(0, 260))
    return
  }
  if (short === "outputAudio/delta") return
  if (short === "sdp") return
  log(short, JSON.stringify(params).slice(0, 160))
})

// --------------------------------------------------------------- webrtc
async function openWebrtc() {
  const requireFrom = createRequire(
    process.env.GATE_WERIFT_DIR ? `${process.env.GATE_WERIFT_DIR}/index.js` : import.meta.url,
  )
  const { RTCPeerConnection, MediaStreamTrack, RtpPacket, RtpHeader, RTCRtpCodecParameters } =
    requireFrom("werift")
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
  pc.addTransceiver(track, { direction: "sendrecv" })
  pc.onTrack.subscribe((remote) => {
    remote.onReceiveRtp.subscribe((rtp) => {
      inboundBytes[phase] = (inboundBytes[phase] ?? 0) + rtp.payload.length
      if (rtp.payload.length > 10) inboundSpeechPackets[phase] = (inboundSpeechPackets[phase] ?? 0) + 1
    })
  })
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  let seq = Math.floor(Math.random() * 30_000)
  let ts = Math.floor(Math.random() * 100_000)
  const sendPacket = (payload) => {
    const header = new RtpHeader({
      sequenceNumber: seq++ % 65_536,
      timestamp: (ts += 960) % 4_294_967_296,
      payloadType: 111,
      ssrc: track.ssrc,
      marker: false,
    })
    track.writeRtp(new RtpPacket(header, payload))
  }
  return {
    sdp: pc.localDescription.sdp,
    accept: (answerSdp) => pc.setRemoteDescription({ type: "answer", sdp: answerSdp }),
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
    close: () => pc.close().catch(() => {}),
  }
}
function startPacing(call) {
  let queue = []
  const timer = setInterval(() => call.sendPacket(queue.length ? queue.shift() : SILENCE_PACKET), 20)
  return {
    speak(packets) {
      queue = queue.concat(packets)
      return sleep(packets.length * 20 + 500)
    },
    stop: () => clearInterval(timer),
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// --------------------------------------------------------------- main
async function main() {
  const requestAudio = synthesizeOpusPackets(REQUEST)
  log("audio", `${requestAudio.length} opus packets (~${(requestAudio.length * 20) / 1000}s)`)

  await request("initialize", {
    clientInfo: { name: "sigil-coordinator-tool-gate", title: "coord tool gate", version: "0.0.1" },
    capabilities: { experimentalApi: true },
  })
  const thread = await request("thread/start", {})
  const threadId = thread.threadId ?? thread.thread?.id
  if (!threadId) throw new Error("thread/start returned no thread id")
  log("thread", threadId)

  const call = await openWebrtc()
  const startParams = {
    threadId,
    version: "v3",
    outputModality: "audio",
    includeStartupContext: false,
    clientManagedHandoffs: false, // forward backend/delegated output to speech
    codexResponseHandoffMode: HANDOFF_MODE,
    codexResponseHandoffChannelPrefixes: CHANNEL_PREFIXES,
    transport: { type: "webrtc", sdp: call.sdp },
  }
  log("start", JSON.stringify({ ...startParams, transport: "<offer>", threadId: "<thread>" }))

  const sessionReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for realtime start")), 60_000)
    notificationHandlers.add(function onStart(n) {
      if (n.method === "thread/realtime/sdp") {
        clearTimeout(timer)
        notificationHandlers.delete(onStart)
        resolve(n.params.sdp)
      } else if (n.method === "thread/realtime/error") {
        clearTimeout(timer)
        notificationHandlers.delete(onStart)
        reject(new Error(`realtime error: ${JSON.stringify(n.params)}`))
      }
    })
  })
  await request("thread/realtime/start", startParams)
  const answerSdp = await sessionReady
  log("answer", `${answerSdp.split("\r\n")[0]} (${answerSdp.length} bytes)`)
  await call.accept(answerSdp)
  await call.connected()
  log("PHASE", "WebRTC connected")
  const pacer = startPacing(call)

  try {
    // Positive control FIRST but SHORT: prove the pipe speaks, then get out of
    // the way so the real request has the whole pre-reset window.
    phase = "control"
    log("PHASE", "control — appendSpeech (prove we can hear the model)")
    await request("thread/realtime/appendSpeech", { threadId, text: CONTROL_TEXT }).catch((e) =>
      log("control-append-error", e.message),
    )
    await sleep(CONTROL_MS)

    // The real request — front-loaded. appendText(user) already proved (prior
    // run) that it makes the coordinator delegate; a spoken copy backs it up.
    phase = "request"
    log("PHASE", "request — appendText(user) asks for the tool")
    await request("thread/realtime/appendText", { threadId, text: REQUEST, role: "user" }).catch((e) =>
      log("appendText-error", e.message),
    )
    // Also speak it, in case a spoken (VAD-committed) turn delegates more eagerly.
    pacer.speak(requestAudio).catch(() => {})

    // Watch the whole window, polling the MCP log so we timestamp the tool call
    // the instant it lands (and still capture it if the session then resets).
    log("PHASE", `watch (${WATCH_MS}ms) — polling MCP log for tools/call`)
    const deadline = Date.now() + WATCH_MS
    let toolSeen = false
    while (Date.now() < deadline) {
      await sleep(1500)
      const mcp = mcpLogText()
      if (!toolSeen && mcp.includes("tools/call")) {
        toolSeen = true
        log("MCP", "tools/call observed in log")
      }
      if (mcp.includes("TOOL-INVOKED") && transcriptsIncludeSentinel()) break
    }

    report()
  } finally {
    pacer.stop()
    phase = "done"
    await request("thread/realtime/stop", { threadId }).catch(() => {})
    call.close()
  }
}

function transcriptsIncludeSentinel() {
  return transcripts.some((t) => t.role === "assistant" && (t.text ?? "").includes(SENTINEL))
}

function mcpLogText() {
  try {
    return existsSync(MCP_LOG) ? readFileSync(MCP_LOG, "utf8") : ""
  } catch {
    return ""
  }
}

function report() {
  const mcp = mcpLogText()
  const toolCalls = mcp.split("\n").filter((l) => l.includes("tools/call"))
  const toolInvoked = mcp.split("\n").filter((l) => l.includes("TOOL-INVOKED"))
  const assistantText = transcripts
    .filter((t) => t.role === "assistant")
    .map((t) => t.text)
    .join(" ")
  const sentinelSpoken = assistantText.includes(SENTINEL)
  const handoffItems = items.filter((i) => i?.item?.type === "handoff_request")
  const controlSpoke = (inboundSpeechPackets.control ?? 0) >= 25

  console.log("\n================ COORDINATOR-TOOL GATE RESULT ================")
  console.log(`codex bin             : ${CODEX_BIN}`)
  console.log(`handoff mode          : ${HANDOFF_MODE}`)
  console.log(`sentinel              : ${SENTINEL}`)
  console.log("\ninbound model voice by phase (speech pkts / bytes):")
  for (const p of ["control", "request", "watch"]) {
    console.log(
      `   ${p.padEnd(14)} ${String(inboundSpeechPackets[p] ?? 0).padStart(5)} pkts  ${String(inboundBytes[p] ?? 0).padStart(7)} bytes`,
    )
  }
  console.log("\n--- MCP SERVER LOG (out-of-band tool-reach proof) ---")
  console.log(mcp.trim() || "(empty — MCP server logged nothing)")
  console.log("\n--- assistant transcripts ---")
  for (const t of transcripts.filter((t) => t.role === "assistant"))
    console.log(`   [${t.phase}] ${JSON.stringify(t.text).slice(0, 220)}`)
  console.log("\n--- handoff_request items (delegation edges) ---")
  for (const h of handoffItems)
    console.log(`   [${h.phase}] ${JSON.stringify(h.item).slice(0, 240)}`)
  console.log(`\nserver->client requests auto-answered: ${serverRequests.length}`)
  for (const r of serverRequests) console.log(`   - ${r.method}`)

  console.log("\n---------------- VERDICT ----------------")
  if (!controlSpoke) {
    console.log("INCONCLUSIVE — positive control produced no model speech; cannot trust")
    console.log("any negative reading below. Fix the control before concluding.")
    process.exitCode = 3
    return
  }
  console.log(`positive control heard : yes (${inboundSpeechPackets.control} pkts)`)
  console.log(`MCP tools/call seen    : ${toolCalls.length > 0 ? "YES" : "no"} (${toolCalls.length})`)
  console.log(`lookup actually invoked: ${toolInvoked.length > 0 ? "YES" : "no"}`)
  console.log(`sentinel reached speech: ${sentinelSpoken ? "YES" : "no"}`)
  console.log(`delegation edges seen  : ${handoffItems.length}`)

  if (toolInvoked.length > 0 && sentinelSpoken) {
    console.log("\nVERDICT: PASS — the coordinator invoked a real tool AND its output reached")
    console.log("spoken output. The coordinator-delegates-via-tools chain works live.")
    process.exitCode = 0
  } else if (toolCalls.length > 0) {
    console.log("\nVERDICT: PARTIAL — the tool was REACHED (backend called it) but the sentinel")
    console.log("did not appear in an assistant transcript in-window. Tool reach is proven;")
    console.log("output-to-speech is unconfirmed (timing/transcript-tail — see notes).")
    process.exitCode = 4
  } else if (handoffItems.length > 0) {
    console.log("\nVERDICT: PARTIAL — the coordinator DELEGATED (handoff_request seen) but no")
    console.log("MCP tools/call was recorded. The delegation edge exists; the backend did not")
    console.log("call the tool in-window.")
    process.exitCode = 5
  } else {
    console.log("\nVERDICT: FAIL — no tool call and no delegation edge observed in-window.")
    process.exitCode = 1
  }
}

main()
  .catch((error) => {
    console.log(`\nPROBE ERROR: ${error.message}`)
    process.exitCode = 2
  })
  .finally(() => {
    child.kill("SIGTERM")
    setTimeout(() => process.exit(process.exitCode ?? 0), 800).unref()
  })
