import type { SigilAuthSession } from "./auth/server"
import { AuthenticationRequiredError } from "./auth/session"
import type {
  BlackboardDoc,
  BlackboardRepository,
} from "@workspace/blackboard-store"

interface ThreadLookup {
  get(userId: string, threadId: string): unknown
}

export function requireBlackboardAccess(
  session: SigilAuthSession | null,
  sessionId: string,
  ownsThread: (userId: string, threadId: string) => boolean,
): SigilAuthSession {
  if (!session) throw new AuthenticationRequiredError()
  if (!ownsThread(session.user.id, sessionId)) {
    throw new Error("Agent session was not found.")
  }
  return session
}

export async function readOwnedBlackboard(
  session: SigilAuthSession | null,
  sessionId: string,
  threads: ThreadLookup,
  blackboards: BlackboardRepository,
): Promise<BlackboardDoc> {
  requireBlackboardAccess(session, sessionId, (userId, threadId) =>
    Boolean(threads.get(userId, threadId)),
  )
  return blackboards.read(sessionId)
}

export async function writeOwnedBlackboard(
  session: SigilAuthSession | null,
  input: { sessionId: string; content: string; expectedRevision: string },
  threads: ThreadLookup,
  blackboards: BlackboardRepository,
): Promise<BlackboardDoc> {
  requireBlackboardAccess(session, input.sessionId, (userId, threadId) =>
    Boolean(threads.get(userId, threadId)),
  )
  return blackboards.write(
    input.sessionId,
    input.content,
    "user",
    input.expectedRevision,
  )
}
