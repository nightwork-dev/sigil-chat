// Live end-to-end check of the PRODUCTION realtime client (not the raw probe):
// drives RealtimeAppServerClient through initialize → thread/start →
// thread/realtime/start (v3) and prints the real answer SDP, then stops and
// disposes cleanly.
//
// NOT CI-safe on purpose: needs network, a `codex login` session in ~/.codex,
// and a codex binary >= 0.146.0-alpha. Run it manually when revalidating the
// wire contract:
//
//   SIGIL_CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex \
//     node --experimental-strip-types docs/specs/evidence/realtime-live-check.mjs
//
// (or point SIGIL_CODEX_BIN at node_modules/.bin/codex from @openai/codex@alpha).
// First verified 2026-07-25: real thread + answer SDP over subscription OAuth.

const { RealtimeAppServerClient } = await import(
  new URL("../../../apps/agent/agent/lib/realtime-appserver.ts", import.meta.url).href
)

// Synthetic but well-formed browser offer — enough to prove call admission.
const offerSdp = [
  "v=0","o=- 4611731400430051336 2 IN IP4 127.0.0.1","s=-","t=0 0","a=group:BUNDLE 0",
  "a=extmap-allow-mixed","a=msid-semantic: WMS","m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0","a=rtcp:9 IN IP4 0.0.0.0","a=ice-ufrag:4ZcD",
  "a=ice-pwd:2/1muCWoOi3uLifh0NuRHlkw","a=ice-options:trickle",
  "a=fingerprint:sha-256 19:E2:1C:3B:4B:9F:81:E6:B8:5C:F4:A5:A8:D8:73:04:BB:05:2F:70:9F:04:A9:0E:05:E9:26:33:E8:70:88:A2",
  "a=setup:actpass","a=mid:0","a=sendrecv","a=msid:- audiotrack","a=rtcp-mux",
  "a=rtpmap:111 opus/48000/2","a=fmtp:111 minptime=10;useinbandfec=1","",
].join("\r\n")

const client = new RealtimeAppServerClient({
  env: process.env,
  startTimeoutMs: 45_000,
  onDiagnostic: (d) => { if (d.type !== "stderr") console.log("[diag]", d.type) },
})
client.subscribe((n) => console.log("[notif]", n.method))
try {
  const { threadId, answerSdp } = await client.start(offerSdp)
  console.log("THREAD:", threadId)
  console.log("ANSWER SDP first lines:\n" + answerSdp.split("\r\n").slice(0, 6).join("\n"))
  await client.stop()
} catch (error) {
  console.log("FAILED:", error.message)
} finally {
  client.dispose()
}
