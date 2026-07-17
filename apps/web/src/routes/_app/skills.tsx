// Route: /skills
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/_app.tsx         — default collapsible icon sidebar + breadcrumb bar + theme picker
//   apps/web/src/routes/_app/skills.tsx  — THIS FILE
// Content: SkillLibrary — searchable Eve capability catalog with an honest Gonk Core lifecycle boundary

import { createFileRoute } from "@tanstack/react-router";

import { SkillLibrary } from "@/features/skills/skill-library";

export const Route = createFileRoute("/_app/skills")({
  component: SkillLibrary,
});
