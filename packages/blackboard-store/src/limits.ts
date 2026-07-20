export const MAX_BLACKBOARD_CONTENT_CHARS = 12_000;

export class BlackboardConflictError extends Error {
  constructor() {
    super("Blackboard changed since it was read.");
    this.name = "BlackboardConflictError";
  }
}

export function assertBlackboardContent(content: string): void {
  if (content.length > MAX_BLACKBOARD_CONTENT_CHARS) {
    throw new Error(
      `Blackboard content must be ${MAX_BLACKBOARD_CONTENT_CHARS} characters or fewer.`,
    );
  }
}
