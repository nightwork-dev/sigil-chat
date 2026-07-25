// Probe: drive a codex app-server's thread/realtime/start over NDJSON stdio
// and print every notification until the realtime call either yields SDP or
// errors. Usage: node realtime-probe.mjs <path-to-codex-binary>
import { spawn } from "node:child_process"

const bin = process.argv[2]
if (!bin) throw new Error("usage: realtime-probe.mjs <codex-binary>")

// Minimal-but-plausible browser offer. Yesterday this shape passed app-server
// validation and reached the backend, so it isolates the backend verdict.
const offerSdp = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0",
  "a=rtcp:9 IN IP4 0.0.0.0",
  "a=ice-ufrag:4ZcD",
  "a=ice-pwd:2/1muCWoOi3uLifh0NuRHlkw",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 19:E2:1C:3B:4B:9F:81:E6:B8:5C:F4:A5:A8:D8:73:04:BB:05:2F:70:9F:04:A9:0E:05:E9:26:33:E8:70:88:A2",
  "a=setup:actpass",
  "a=mid:0",
  "a=sendrecv",
  "a=msid:- audiotrack",
  "a=rtcp-mux",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "",
].join("\r\n")

const extraArgs = process.argv.slice(3)
const args = extraArgs.length
  ? extraArgs
  : ["app-server", "--stdio", "-c", "features.realtime_conversation=true", "-c", "mcp_servers={}"]
const child = spawn(bin, args, {
  stdio: ["pipe", "pipe", "pipe"],
})
child.stderr.on("data", (d) => process.stderr.write(`[stderr] ${d}`))

let nextId = 1
const send = (method, params, isRequest = true) => {
  const msg = isRequest
    ? { jsonrpc: "2.0", id: nextId++, method, params }
    : { jsonrpc: "2.0", method, params }
  child.stdin.write(JSON.stringify(msg) + "\n")
  return msg.id
}

let buffer = ""
let threadId
const deadline = setTimeout(() => {
  console.log("TIMEOUT waiting for realtime outcome")
  child.kill()
  process.exit(2)
}, 60_000)

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx)
    buffer = buffer.slice(idx + 1)
    if (!line.trim()) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      console.log("[unparsed]", line.slice(0, 200))
      continue
    }
    handle(msg)
  }
})

function handle(msg) {
  const label = msg.method ?? `response#${msg.id}`
  console.log(`<- ${label}: ${JSON.stringify(msg.result ?? msg.params ?? msg.error ?? {}).slice(0, 400)}`)

  if (msg.id === 1 && msg.result) {
    send("thread/start", {})
  } else if (msg.id === 2 && msg.result) {
    threadId = msg.result.threadId ?? msg.result.thread?.id
    console.log(`thread started: ${threadId}`)
    const extra = process.env.PROBE_EXTRA ? JSON.parse(process.env.PROBE_EXTRA) : {}
    send("thread/realtime/start", {
      threadId,
      outputModality: "audio",
      transport: { type: "webrtc", sdp: offerSdp },
      ...extra,
    })
  } else if (msg.method === "thread/realtime/sdp") {
    console.log("=== ANSWER SDP RECEIVED ===")
    console.log((msg.params.sdp ?? "").slice(0, 600))
    clearTimeout(deadline)
    child.kill()
    process.exit(0)
  } else if (msg.method === "thread/realtime/error") {
    console.log("=== REALTIME ERROR ===")
    console.log(JSON.stringify(msg.params))
    clearTimeout(deadline)
    child.kill()
    process.exit(1)
  }
}

send("initialize", {
  clientInfo: { name: "sigil-probe", title: "sigil probe", version: "0.0.1" },
  capabilities: { experimentalApi: true },
})
