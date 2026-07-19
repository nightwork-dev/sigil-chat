import type { ContextContributor } from "@gonk/context";

export const fixtureResourceProvider: ContextContributor = {
  id: "fixture-resource",
  discover: () => [
    {
      candidateId: "fixture-resource:hello",
      contributorId: "fixture-resource",
      resourceKey: "fixture:hello",
      revisionHint: "1",
      necessity: "required",
      priority: 100,
      estimatedTokens: 4,
      estimateQuality: "exact",
    },
  ],
  resolve: ({ candidate }) => ({
    candidateId: candidate.candidateId,
    contributorId: candidate.contributorId,
    resourceKey: candidate.resourceKey,
    revision: "1",
    necessity: candidate.necessity,
    priority: candidate.priority,
    audience: "model",
    content: "Fixture resource provider is available.",
    resource: {
      kind: "application:fixture-resource",
      target: candidate.resourceKey,
    },
  }),
};
