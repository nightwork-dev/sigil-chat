import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { BlackboardDoc } from "@workspace/blackboard-store/types";

const readBlackboardFn = createServerFn({ method: "GET" })
  .validator((input: { sessionId: string }) => input)
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const { blackboardRepository } =
      await import("@workspace/blackboard-store");
    return blackboardRepository.read(data.sessionId);
  });

const writeBlackboardFn = createServerFn({ method: "POST" })
  .validator(
    (input: { sessionId: string; content: string; updatedBy: string }) => input,
  )
  .handler(async ({ data }): Promise<BlackboardDoc> => {
    const { blackboardRepository } =
      await import("@workspace/blackboard-store");
    return blackboardRepository.write(
      data.sessionId,
      data.content,
      data.updatedBy,
    );
  });

export const blackboardKeys = {
  all: () => ["blackboard"] as const,
  detail: (sessionId: string) => [...blackboardKeys.all(), sessionId] as const,
};

export function useBlackboard(sessionId: string | undefined) {
  return useQuery({
    queryKey: blackboardKeys.detail(sessionId ?? "none"),
    queryFn: () => readBlackboardFn({ data: { sessionId: sessionId ?? "" } }),
    enabled: Boolean(sessionId),
    refetchOnMount: "always",
    refetchOnReconnect: "always",
    refetchOnWindowFocus: "always",
    refetchInterval: 15_000,
  });
}

export function useWriteBlackboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      sessionId: string;
      content: string;
      updatedBy: string;
    }) => writeBlackboardFn({ data: input }),
    onSuccess: (document) => {
      queryClient.setQueryData(
        blackboardKeys.detail(document.sessionId),
        document,
      );
      return queryClient.invalidateQueries({
        queryKey: blackboardKeys.detail(document.sessionId),
      });
    },
  });
}
