// Route: /skills
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible icon sidebar + breadcrumb bar + theme picker
//   apps/web/src/routes/_app/skills.tsx  — THIS FILE
// Content: SkillsManager — searchable managed-skill catalog with create/edit/delete via Gonk's skill registry

import { createFileRoute } from "@tanstack/react-router";

import { SkillsManager } from "@/features/skills-manager/skills-manager";
import { ManagementTabs } from "@/components/management-tabs";

export const Route = createFileRoute("/_app/skills")({
  staticData: { rail: { top: ManagementTabs } },
  component: SkillsManager,
});
