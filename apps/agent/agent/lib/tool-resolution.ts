export interface ScopedToolAttachment<T = unknown> {
  readonly toolId: string
  readonly scopeId: string
  readonly enabled: boolean
  readonly configuration?: T
}

export interface ResolvedToolState<T = unknown> {
  readonly toolId: string
  readonly registered: boolean
  readonly visible: boolean
  readonly enabled: boolean
  readonly configuration: T | undefined
  readonly contributingScopeIds: readonly string[]
  readonly clientApproval: "not-required" | "pending" | "approved"
  readonly invocationAuthorized: boolean | undefined
  readonly invokable: boolean | undefined
}

export interface ToolResolutionPolicy<T = unknown> {
  resolveEnablement(attachments: readonly ScopedToolAttachment<T>[]): boolean
  resolveConfiguration(
    attachments: readonly ScopedToolAttachment<T>[],
  ): T | undefined
}

export interface ToolInvocationRequest {
  readonly operation: string
  readonly resourceTargets: readonly string[]
}

export function resolveToolState<T>(input: {
  toolId: string
  registeredToolIds: readonly string[]
  candidateScopeIds: readonly string[]
  attachments: readonly ScopedToolAttachment<T>[]
  clientApproval: ResolvedToolState<T>["clientApproval"]
  policy: ToolResolutionPolicy<T>
}): ResolvedToolState<T> {
  const registered = input.registeredToolIds.includes(input.toolId)
  const attachments = input.candidateScopeIds.flatMap((scopeId) =>
    input.attachments.filter(
      (attachment) =>
        attachment.toolId === input.toolId && attachment.scopeId === scopeId,
    ),
  )
  return {
    toolId: input.toolId,
    registered,
    visible: registered && attachments.length > 0,
    enabled: registered && input.policy.resolveEnablement(attachments),
    configuration: input.policy.resolveConfiguration(attachments),
    contributingScopeIds: attachments.map((entry) => entry.scopeId),
    clientApproval: input.clientApproval,
    invocationAuthorized: undefined,
    invokable: undefined,
  }
}

export function authorizeToolInvocation<T>(input: {
  state: ResolvedToolState<T>
  request: ToolInvocationRequest
  authorize(request: ToolInvocationRequest): boolean
}): ResolvedToolState<T> {
  const invocationAuthorized = input.authorize(input.request)
  return {
    ...input.state,
    invocationAuthorized,
    invokable:
      input.state.enabled &&
      input.state.clientApproval !== "pending" &&
      invocationAuthorized,
  }
}
