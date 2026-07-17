// Route: /examples/chat
// Tree:
//   apps/web/src/routes/__root.tsx    — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/examples.tsx  — global nav strip (wordmark + Components/Examples + theme picker)
//   apps/web/src/routes/examples/chat.tsx — THIS FILE
// Content: @workspace/chat component catalog — each component shown in isolation

import { createFileRoute } from "@tanstack/react-router"
import { useState, useCallback } from "react"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

import { ChatMessage, StreamingCursor } from "@workspace/chat/components/chat-message"
import { ChatThinking } from "@workspace/chat/components/chat-thinking"
import { ChatMarkdown } from "@workspace/chat/components/chat-markdown"
import { ChatInput } from "@workspace/chat/components/chat-input"
import { ChatList, ChatSeparator } from "@workspace/chat/components/chat-list"
import { ChatMessageActions, ChatSwipeControls } from "@workspace/chat/components/chat-actions"

export const Route = createFileRoute("/examples/chat")({
  component: ChatPreview,
})

const SAMPLE_MARKDOWN = `Here's a **bold** statement and some *italic* text.

Inline code: \`const x = 42\`

A code block:

\`\`\`ts
function greet(name: string) {
  return \`Hello, \${name}!\`
}
\`\`\`

A list:
- First item
- Second item with **emphasis**
- Third item

And a numbered list:
1. Step one
2. Step two
3. Step three`

const SAMPLE_THINKING = `Let me think about how to explain this clearly.

The user is asking about code architecture. I should cover:
1. The component structure
2. How data flows through props
3. The rendering lifecycle

I'll use a concrete example rather than abstract descriptions.`

function ChatPreview() {
  const [inputValue, setInputValue] = useState("")
  const [streamingDemo, setStreamingDemo] = useState(false)
  const [swipeIndex, setSwipeIndex] = useState(0)
  const [actionLog, setActionLog] = useState<string[]>([])

  const logAction = useCallback((action: string) => {
    setActionLog((prev) => [action, ...prev].slice(0, 5))
  }, [])

  const toggleStreaming = useCallback(() => {
    setStreamingDemo((v) => !v)
  }, [])

  return (
    <div className="p-6">
      <div className="mx-auto max-w-4xl space-y-8 animate-fade-up">
        <div className="space-y-1">
          <h1 className="text-xl font-medium">Chat Components</h1>
          <p className="text-sm text-muted-foreground">
            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">@workspace/chat</code> — shared primitives for chat interfaces
          </p>
        </div>

        {/* ChatMessage — user */}
        <section className="space-y-3">
          <SectionTitle>ChatMessage — user</SectionTitle>
          <ImportLine>{'import { ChatMessage } from "@workspace/chat/components/chat-message"'}</ImportLine>
          <Card>
            <CardContent className="pt-4">
              <ChatMessage
                role="user"
                content="Can you explain how the theme system works? I want to add a custom variant."
                timestamp="14:22"
              />
            </CardContent>
          </Card>
        </section>

        {/* ChatMessage — assistant with markdown */}
        <section className="space-y-3">
          <SectionTitle>ChatMessage — assistant with markdown</SectionTitle>
          <Card>
            <CardContent className="pt-4">
              <ChatMessage
                role="assistant"
                content={SAMPLE_MARKDOWN}
                timestamp="14:23"
                roleLabel="qwen3.5-397b"
              />
            </CardContent>
          </Card>
        </section>

        {/* ChatMessage — with thinking */}
        <section className="space-y-3">
          <SectionTitle>ChatMessage — with thinking block</SectionTitle>
          <Card>
            <CardContent className="pt-4">
              <ChatMessage
                role="assistant"
                content="The architecture uses a two-layer approach. The `:root` block holds color values as CSS custom properties. The `@theme inline` block maps Tailwind tokens to those properties via `var()`. Theme classes override the `:root` values, and Tailwind reads the updated references automatically."
                thinking={SAMPLE_THINKING}
                timestamp="14:24"
              />
            </CardContent>
          </Card>
        </section>

        {/* ChatMessage — streaming */}
        <section className="space-y-3">
          <SectionTitle>ChatMessage — streaming state</SectionTitle>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={toggleStreaming}
              className="text-[10px] font-mono px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
            >
              {streamingDemo ? "stop" : "simulate stream"}
            </button>
            <StreamingCursor className={streamingDemo ? "" : "opacity-0"} />
          </div>
          <Card>
            <CardContent className="pt-4">
              <ChatMessage
                role="assistant"
                content={streamingDemo ? "The theme system uses CSS custom properties with a two-layer architecture..." : "The theme system uses CSS custom properties with a two-layer architecture. Click 'simulate stream' to see the streaming cursor."}
                thinking={streamingDemo ? "Thinking about the best way to explain..." : ""}
                isStreaming={streamingDemo}
                timestamp="now"
              />
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ChatThinking — standalone */}
        <section className="space-y-3">
          <SectionTitle>ChatThinking — standalone</SectionTitle>
          <ImportLine>{'import { ChatThinking } from "@workspace/chat/components/chat-thinking"'}</ImportLine>
          <Card>
            <CardContent className="pt-4">
              <ChatThinking content={SAMPLE_THINKING} />
            </CardContent>
          </Card>
        </section>

        {/* ChatMarkdown — standalone */}
        <section className="space-y-3">
          <SectionTitle>ChatMarkdown — standalone</SectionTitle>
          <ImportLine>{'import { ChatMarkdown } from "@workspace/chat/components/chat-markdown"'}</ImportLine>
          <Card>
            <CardContent className="pt-4">
              <ChatMarkdown content={SAMPLE_MARKDOWN} />
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ChatInput */}
        <section className="space-y-3">
          <SectionTitle>ChatInput — compose bar</SectionTitle>
          <ImportLine>{'import { ChatInput } from "@workspace/chat/components/chat-input"'}</ImportLine>
          <Card>
            <CardContent className="p-0">
              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSend={() => setInputValue("")}
                placeholder="Type something and press Enter..."
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-0">
              <ChatInput
                value="Streaming in progress..."
                onChange={() => {}}
                onSend={() => {}}
                onStop={() => {}}
                isStreaming
                placeholder=""
              />
            </CardContent>
          </Card>
        </section>

        <Separator />

        {/* ChatMessageActions + ChatSwipeControls — interactive */}
        <section className="space-y-3">
          <SectionTitle>ChatMessageActions + ChatSwipeControls — interactive</SectionTitle>
          <ImportLine>{'import { ChatMessageActions, ChatSwipeControls } from "@workspace/chat/components/chat-actions"'}</ImportLine>

          {/* Swipe demo */}
          <Card>
            <CardContent className="pt-4">
              <ChatMessage
                role="assistant"
                content={
                  swipeIndex === 0
                    ? "This is the **first** response variant. Use the chevrons to navigate between siblings."
                    : swipeIndex === 1
                      ? "This is the **second** variant — a rerolled response with different content but the same prompt."
                      : "The **third** variant. Each sibling is an alternative response. The swipe controls show your position."
                }
                timestamp="14:30"
                actions={
                  <>
                    <ChatSwipeControls
                      siblingCount={3}
                      activeIndex={swipeIndex}
                      onPrev={() => setSwipeIndex((i) => Math.max(0, i - 1))}
                      onNext={() => setSwipeIndex((i) => Math.min(2, i + 1))}
                    />
                    <ChatMessageActions
                      isAssistant
                      isLastTurn
                      onReroll={() => logAction("reroll")}
                      onContinue={() => logAction("continue")}
                      onDelete={() => logAction("delete")}
                    />
                  </>
                }
              />
            </CardContent>
          </Card>

          {/* Action log */}
          {actionLog.length > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
              <span>actions:</span>
              {actionLog.map((a, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-secondary">{a}</span>
              ))}
            </div>
          )}

          {/* Standalone components */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">SwipeControls</span>
                <ChatSwipeControls
                  siblingCount={5}
                  activeIndex={2}
                  onPrev={() => {}}
                  onNext={() => {}}
                />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted-foreground">Actions (hover →)</span>
                <div className="group/msg">
                  <ChatMessageActions
                    isAssistant
                    isLastTurn
                    onReroll={() => logAction("reroll")}
                    onContinue={() => logAction("continue")}
                    onDelete={() => logAction("delete")}
                    className="!opacity-100"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* ChatList + ChatSeparator */}
        <section className="space-y-3">
          <SectionTitle>ChatList — auto-scrolling container</SectionTitle>
          <ImportLine>{'import { ChatList, ChatSeparator } from "@workspace/chat/components/chat-list"'}</ImportLine>
          <Card>
            <CardContent className="p-0 h-80 flex flex-col">
              <ChatList>
                <ChatMessage
                  role="user"
                  content="First message"
                  timestamp="14:00"
                />
                <ChatMessage
                  role="assistant"
                  content="Response with **markdown** and `inline code`."
                  timestamp="14:00"
                />
                <ChatSeparator label="earlier today" />
                <ChatMessage
                  role="user"
                  content="Second question about the system"
                  timestamp="15:30"
                />
                <ChatMessage
                  role="assistant"
                  content="A longer response that demonstrates how messages stack in the scroll container. The ChatList component auto-scrolls to bottom when new content is added, but respects user scroll-up to read history."
                  thinking="Thinking about how to explain scroll behavior..."
                  timestamp="15:31"
                />
                <ChatMessage
                  role="user"
                  content="One more to fill the container"
                  timestamp="15:35"
                />
                <ChatMessage
                  role="assistant"
                  content="This message should be near the bottom. If the container is shorter than the content, you should see a scrollbar. The auto-scroll-to-bottom behavior activates when you're within 80px of the bottom edge."
                  timestamp="15:35"
                />
              </ChatList>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  )
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  )
}

function ImportLine({ children }: { children: string }) {
  return (
    <div className="text-[10px] font-mono text-muted-foreground/50 bg-muted/30 px-2 py-1 rounded">
      {children}
    </div>
  )
}
