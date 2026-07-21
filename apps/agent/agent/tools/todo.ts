import { defineTool } from "eve/tools";
import { z } from "zod";

import { SessionTodoStore, type SessionTodoItem } from "../lib/session-todos";

const todoStore = new SessionTodoStore();

const todoItemSchema = z.strictObject({
  content: z.string().describe("Brief description of the task."),
  priority: z.enum(["high", "medium", "low"]).describe("Priority level."),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe("Current status of the task."),
});

const inputSchema = z.strictObject({
  todos: z
    .array(todoItemSchema)
    .describe("The updated todo list. Omit to read it without modifying it.")
    .optional(),
});

const countSchema = z.number().int().min(0);
const outputSchema = z.strictObject({
  counts: z.strictObject({
    cancelled: countSchema,
    completed: countSchema,
    in_progress: countSchema,
    pending: countSchema,
    total: countSchema,
  }),
  todos: z.array(todoItemSchema),
});

export function formatTodoResult(items: readonly SessionTodoItem[]) {
  const counts = {
    cancelled: 0,
    completed: 0,
    in_progress: 0,
    pending: 0,
    total: items.length,
  };
  for (const item of items) counts[item.status] += 1;
  return { counts, todos: items.map((item) => ({ ...item })) };
}

export default defineTool({
  description: [
    "Use this tool to create and manage a structured task list for the current session.",
    "Call with `todos` to replace the entire list; omit `todos` to read it.",
    "Mark tasks in_progress when starting, completed when done, and keep only one task in_progress at a time.",
  ].join("\n"),
  inputSchema,
  outputSchema,
  execute(input, ctx) {
    const items =
      input.todos === undefined
        ? todoStore.read(ctx.session.id)
        : todoStore.replace(ctx.session.id, input.todos);
    return formatTodoResult(items);
  },
});
