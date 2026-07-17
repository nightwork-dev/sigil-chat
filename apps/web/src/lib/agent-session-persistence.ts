export class AgentSessionPersistenceQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private latest: Promise<unknown> = Promise.resolve();

  enqueue<T>(write: () => Promise<T>): Promise<T> {
    // Recover only the private sequencing tail so a later explicit retry can
    // run. The returned operation and `latest` remain rejected, preserving the
    // failure for the caller and for dependent actions.
    const operation = this.tail.catch(() => undefined).then(write);
    this.tail = operation;
    this.latest = operation;
    return operation;
  }

  async afterPersisted<T>(action: () => Promise<T>): Promise<T> {
    await this.latest;
    return action();
  }
}

export class AgentSessionRevisionChain {
  constructor(private revision: number) {}

  current(): number {
    return this.revision;
  }

  async apply<T extends { revision: number }>(
    mutation: (expectedRevision: number) => Promise<T>,
  ): Promise<T> {
    const result = await mutation(this.revision);
    this.revision = result.revision;
    return result;
  }
}

export class AgentSessionPersistenceCoordinator {
  private readonly queue = new AgentSessionPersistenceQueue();
  private readonly revisions: AgentSessionRevisionChain;

  constructor(revision: number) {
    this.revisions = new AgentSessionRevisionChain(revision);
  }

  persist<T extends { revision: number }>(
    mutation: (expectedRevision: number) => Promise<T>,
  ): Promise<T> {
    return this.queue.enqueue(() => this.revisions.apply(mutation));
  }

  afterPersisted<T>(action: () => Promise<T>): Promise<T> {
    return this.queue.afterPersisted(action);
  }

  currentRevision(): number {
    return this.revisions.current();
  }
}

export function createSingleWriteSessionPersistence<TSnapshot>(
  persistFinalSnapshot: (snapshot: TSnapshot) => void,
): { onFinish: (snapshot: TSnapshot) => void } {
  return { onFinish: persistFinalSnapshot };
}
