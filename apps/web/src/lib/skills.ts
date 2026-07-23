import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type {
  ManagedSkillDetail,
  ManagedSkillSummary,
  SkillArchiveResult,
  SkillGetResult,
  SkillListResult,
  SkillMutationResult,
  SkillScope,
} from "@workspace/agent-tools/skills";

export type SkillListInput = {
  scope?: SkillScope;
  includeFreshness?: boolean;
};

export type SkillGetInput = {
  id: string;
  scope?: SkillScope;
  includeFreshness?: boolean;
};

export type SkillUpsertInput = {
  id: string;
  scope: SkillScope;
  body: string;
  description?: string;
  expectedRevision?: string;
  idempotencyKey?: string;
};

export type SkillDeleteInput = {
  id: string;
  expectedRevision: string;
  scope?: SkillScope;
  idempotencyKey?: string;
};

export type SkillCatalog = SkillListResult;
export type SkillDetail = SkillGetResult;
export type SkillClientCommand = {
  type: "agent.domain.outcome";
  payload: {
    id: string;
    kind: "skills.changed";
    resource: { kind: "skills-catalog"; id: string };
    operation: string;
    changedIds: readonly string[];
  };
};
export type SkillChangeResult =
  | (SkillMutationResult & { clientCommand?: SkillClientCommand })
  | (SkillArchiveResult & { clientCommand?: SkillClientCommand });

const listSkillsFn = createServerFn({ method: "GET" })
  .validator((input: SkillListInput) => input)
  .handler(async ({ data }): Promise<SkillCatalog> => {
    const { listManagedSkills } = await import("./skills.server");
    return listManagedSkills(data);
  });

const getSkillFn = createServerFn({ method: "GET" })
  .validator((input: SkillGetInput) => input)
  .handler(async ({ data }): Promise<SkillDetail> => {
    const { getManagedSkill } = await import("./skills.server");
    return getManagedSkill(data);
  });

const upsertSkillFn = createServerFn({ method: "POST" })
  .validator((input: SkillUpsertInput) => input)
  .handler(async ({ data }): Promise<SkillChangeResult> => {
    const { upsertManagedSkillFromWeb } = await import("./skills.server");
    return upsertManagedSkillFromWeb(data);
  });

const deleteSkillFn = createServerFn({ method: "POST" })
  .validator((input: SkillDeleteInput) => input)
  .handler(async ({ data }): Promise<SkillChangeResult> => {
    const { deleteManagedSkillFromWeb } = await import("./skills.server");
    return deleteManagedSkillFromWeb(data);
  });

export const skillKeys = {
  all: () => ["skills"] as const,
  list: (input: SkillListInput = {}) =>
    [...skillKeys.all(), "list", input] as const,
  detail: (input: SkillGetInput) =>
    [...skillKeys.all(), "detail", input] as const,
};

export function useSkills(input: SkillListInput = {}) {
  return useQuery({
    queryKey: skillKeys.list(input),
    queryFn: () => listSkillsFn({ data: input }),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useSkill(
  id: string | undefined,
  options: Omit<SkillGetInput, "id"> = {},
) {
  const input = { id: id ?? "", ...options };
  return useQuery({
    queryKey: skillKeys.detail(input),
    queryFn: () => getSkillFn({ data: input }),
    enabled: Boolean(id),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useUpsertSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillUpsertInput) => upsertSkillFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.all() }),
  });
}

export function useDeleteSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillDeleteInput) => deleteSkillFn({ data: input }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: skillKeys.all() }),
  });
}

export type { ManagedSkillDetail, ManagedSkillSummary };
