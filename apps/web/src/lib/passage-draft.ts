export interface PassageDraftSource {
  passageId: string;
  body: string;
  revision: number;
}

export interface LocalPassageDraft {
  passageId: string;
  baseBody: string;
  baseRevision: number;
  body: string;
}

export type PassageDraftState = LocalPassageDraft | null;

export type PassageDraftAction =
  | { type: "edit"; body: string; source: PassageDraftSource }
  | { type: "discard" }
  | { type: "saved" };

export interface PassageDraftProjection {
  body: string;
  dirty: boolean;
  expectedBody: string;
  expectedRevision: number;
  conflict: null | {
    localBody: string;
    persistedBody: string;
    persistedRevision: number;
  };
}

export function passageDraftReducer(
  state: PassageDraftState,
  action: PassageDraftAction,
): PassageDraftState {
  if (action.type === "discard" || action.type === "saved") return null;

  const active = state?.passageId === action.source.passageId ? state : null;
  if (!active && action.body === action.source.body) return null;
  return {
    passageId: action.source.passageId,
    baseBody: active?.baseBody ?? action.source.body,
    baseRevision: active?.baseRevision ?? action.source.revision,
    body: action.body,
  };
}

export function projectPassageDraft(
  state: PassageDraftState,
  source: PassageDraftSource,
): PassageDraftProjection {
  const active = state?.passageId === source.passageId ? state : null;
  if (!active || active.body === active.baseBody) {
    return {
      body: source.body,
      dirty: false,
      expectedBody: source.body,
      expectedRevision: source.revision,
      conflict: null,
    };
  }

  const conflicted =
    active.baseBody !== source.body || active.baseRevision !== source.revision;
  return {
    body: active.body,
    dirty: true,
    expectedBody: active.baseBody,
    expectedRevision: active.baseRevision,
    conflict: conflicted
      ? {
          localBody: active.body,
          persistedBody: source.body,
          persistedRevision: source.revision,
        }
      : null,
  };
}
