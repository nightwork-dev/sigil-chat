"use client"

import { createContext, useContext, type ReactNode } from "react"

const AgentPrincipalContext = createContext<string | null>(null)

export function AgentPrincipalProvider({
  children,
  principalId,
}: {
  children: ReactNode
  principalId: string
}) {
  return (
    <AgentPrincipalContext.Provider value={principalId}>
      {children}
    </AgentPrincipalContext.Provider>
  )
}

export function useAgentPrincipalId(): string {
  const principalId = useContext(AgentPrincipalContext)
  if (!principalId) {
    throw new Error("Agent queries require an authenticated principal context.")
  }
  return principalId
}
