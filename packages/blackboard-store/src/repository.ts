import { MirkBlackboardRepository } from "./mirk-repository.js";
import { assertBlackboardContent } from "./limits.js";
import type { BlackboardDoc } from "./types.js";

export interface BlackboardRepository {
  read(sessionId: string): Promise<BlackboardDoc>;
  write(
    sessionId: string,
    content: string,
    updatedBy: string,
  ): Promise<BlackboardDoc>;
}

export class MemoryBlackboardRepository implements BlackboardRepository {
  private readonly documents = new Map<string, BlackboardDoc>();
  private readonly now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.now = now;
  }

  async read(sessionId: string): Promise<BlackboardDoc> {
    const document = this.documents.get(sessionId);
    return structuredClone(
      document ?? {
        sessionId,
        content: "",
        updatedAt: "",
        updatedBy: "",
      },
    );
  }

  async write(
    sessionId: string,
    content: string,
    updatedBy: string,
  ): Promise<BlackboardDoc> {
    assertBlackboardContent(content);
    const document: BlackboardDoc = {
      sessionId,
      content,
      updatedAt: this.now(),
      updatedBy,
    };
    this.documents.set(sessionId, document);
    return structuredClone(document);
  }
}

export { MirkBlackboardRepository } from "./mirk-repository.js";

export const blackboardRepository: BlackboardRepository =
  new MirkBlackboardRepository();

export type { BlackboardDoc } from "./types.js";
