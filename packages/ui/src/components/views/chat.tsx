// View: Chat / conversation
// Canonical content surface built on @workspace/chat (message rendering +
// compose). Fills any Layout content region (hosted in SidebarShell,
// FooterShell). Decoupled — data is internal mock; `model` label via prop.
// Demonstrates: threading (swipe between alternatives), reroll, continue, delete

import { useState, useCallback } from "react"
import { Badge } from "@workspace/ui/components/badge"
import { ChatMessage } from "@workspace/chat/components/chat-message"
import { ChatList } from "@workspace/chat/components/chat-list"
import { ChatInput } from "@workspace/chat/components/chat-input"
import { ChatMessageActions, ChatSwipeControls } from "@workspace/chat/components/chat-actions"

// --- Mock data with threading (sibling alternatives) ---

interface Turn {
  siblings: MessageData[]
  activeIndex: number
}

interface MessageData {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string
  timestamp: string
}

const initialTurns: Turn[] = [
  {
    siblings: [{
      id: "1",
      role: "user",
      content: "Can you explain how the routing system works in this template?",
      timestamp: "14:22",
    }],
    activeIndex: 0,
  },
  {
    siblings: [
      {
        id: "2a",
        role: "assistant",
        content:
          "The template uses **TanStack Router** with file-based routing. Each file in `src/routes/` becomes a route automatically.\n\nLayout routes use the `_` prefix — they wrap child routes via `<Outlet />` without adding a URL segment. For example, `_sidebar.tsx` provides the sidebar shell for all routes under `_sidebar/`.\n\nThe root layout (`__root.tsx`) provides the outermost wrapper.",
        thinking:
          "The user is asking about routing. Let me explain TanStack Router's file-based routing system and how layouts work in this template.",
        timestamp: "14:22",
      },
      {
        id: "2b",
        role: "assistant",
        content:
          "Routing is file-based — drop a `.tsx` file in `src/routes/` and it becomes a route:\n\n- `routes/index.tsx` → `/`\n- `routes/about.tsx` → `/about`\n- `routes/items/$id.tsx` → `/items/:id`\n\nLayouts wrap child routes. `sidebar.tsx` provides the sidebar shell. The root layout is minimal — just an `<Outlet />`.\n\n```tsx\nexport const Route = createFileRoute(\"/about\")({\n  component: About,\n})\n```",
        thinking:
          "Let me try a more code-focused explanation with concrete file paths and a code example.",
        timestamp: "14:22",
      },
    ],
    activeIndex: 0,
  },
  {
    siblings: [{
      id: "3",
      role: "user",
      content: "What about data fetching?",
      timestamp: "14:23",
    }],
    activeIndex: 0,
  },
  {
    siblings: [{
      id: "4",
      role: "assistant",
      content:
        "Data fetching uses **React Query** (`@tanstack/react-query`). The QueryClient is created in `main.tsx` and passed through context.\n\nAPI calls go through typed helpers in `lib/api.ts`:\n\n```ts\nconst data = await get<MyType>(\"/endpoint\")\n```\n\nIn dev, requests to `/api/*` are intercepted by a Vite plugin and routed to the Hono server in-process — no CORS, no proxy, no separate server process.",
      timestamp: "14:23",
    }],
    activeIndex: 0,
  },
  {
    siblings: [{
      id: "5",
      role: "user",
      content: "Nice. How would I add a new API endpoint?",
      timestamp: "14:24",
    }],
    activeIndex: 0,
  },
  {
    siblings: [{
      id: "6",
      role: "assistant",
      content:
        'Add a route handler in `api.ts`:\n\n```ts\napp.get("/api/my-endpoint", (c) => {\n  return c.json({ message: "hello" })\n})\n```\n\nThat\'s it. The Vite plugin picks it up immediately in dev. In production, `server.ts` serves the Hono app directly.',
      timestamp: "14:24",
    }],
    activeIndex: 0,
  },
]

export function ChatView({ model = "claude-3.5-sonnet" }: { model?: string }) {
  const [input, setInput] = useState("")
  const [turns, setTurns] = useState(initialTurns)

  const handleSend = useCallback(() => {
    if (!input.trim()) return
    setTurns((prev) => [
      ...prev,
      {
        siblings: [{
          id: `user-${Date.now()}`,
          role: "user",
          content: input,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        }],
        activeIndex: 0,
      },
    ])
    setInput("")
  }, [input])

  const handleSwipe = useCallback((turnIndex: number, direction: "prev" | "next") => {
    setTurns((prev) => prev.map((turn, i) => {
      if (i !== turnIndex) return turn
      const next = direction === "prev" ? turn.activeIndex - 1 : turn.activeIndex + 1
      if (next < 0 || next >= turn.siblings.length) return turn
      return { ...turn, activeIndex: next }
    }))
  }, [])

  const handleDelete = useCallback((turnIndex: number) => {
    setTurns((prev) => prev.slice(0, turnIndex))
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Model indicator */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {model}
        </Badge>
        <span className="text-[10px] text-muted-foreground font-mono">
          ctx: 4,096 tokens
        </span>
      </div>

      {/* Messages */}
      <ChatList>
        {turns.map((turn, turnIndex) => {
          const msg = turn.siblings[turn.activeIndex]
          const isLast = turnIndex === turns.length - 1
          const isAssistant = msg.role === "assistant"

          return (
            <ChatMessage
              key={`${turnIndex}-${turn.activeIndex}`}
              role={msg.role}
              content={msg.content}
              thinking={msg.thinking}
              timestamp={msg.timestamp}
              roleLabel={isAssistant ? model : undefined}
              actions={
                <>
                  <ChatSwipeControls
                    siblingCount={turn.siblings.length}
                    activeIndex={turn.activeIndex}
                    onPrev={() => handleSwipe(turnIndex, "prev")}
                    onNext={() => handleSwipe(turnIndex, "next")}
                  />
                  <ChatMessageActions
                    isAssistant={isAssistant}
                    isLastTurn={isLast}
                    onReroll={isAssistant ? () => {} : undefined}
                    onContinue={isAssistant && isLast ? () => {} : undefined}
                    onDelete={() => handleDelete(turnIndex)}
                  />
                </>
              }
            />
          )
        })}
      </ChatList>

      {/* Compose */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
      />
    </div>
  )
}
