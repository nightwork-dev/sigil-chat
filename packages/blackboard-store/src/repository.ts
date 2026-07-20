import { MirkBlackboardRepository } from "./mirk-repository.js";
import { assertBlackboardContent, BlackboardConflictError } from "./limits.js";
import type { BlackboardDoc } from "./types.js";
import { randomUUID } from "node:crypto";

export interface BlackboardRepository {
  read(sessionId: string): Promise<BlackboardDoc>;
  write(
    sessionId: string,
    content: string,
    updatedBy: string,
    expectedRevision?: string,
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
        revision: "",
        updatedAt: "",
        updatedBy: "",
      },
    );
  }

  async write(
    sessionId: string,
    content: string,
    updatedBy: string,
    expectedRevision?: string,
  ): Promise<BlackboardDoc> {
    assertBlackboardContent(content);
    const current = this.documents.get(sessionId);
    if (
      expectedRevision !== undefined &&
      (current?.revision ?? "") !== expectedRevision
    ) {
      throw new BlackboardConflictError();
    }
    const document: BlackboardDoc = {
      sessionId,
      content,
      revision: randomUUID(),
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
