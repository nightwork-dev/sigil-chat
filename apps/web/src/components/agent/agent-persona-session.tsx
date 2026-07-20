"use client"

import { createContext, useContext, type ReactNode } from "react"

const AgentPersonaSessionContext = createContext<string | null>(null)

export function AgentPersonaSessionProvider({
  children,
  personaId,
}: {
  children: ReactNode
  personaId: string
}) {
  return (
    <AgentPersonaSessionContext.Provider value={personaId}>
      {children}
    </AgentPersonaSessionContext.Provider>
  )
}

export function useAgentPersonaSession(): string | null {
  return useContext(AgentPersonaSessionContext)
}
