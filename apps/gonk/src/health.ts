export function createHealthResponse(): Response {
  return Response.json({ status: "ok", service: "sigil-chat-gonk" })
}
