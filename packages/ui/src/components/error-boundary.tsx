"use client"

// Genuinely functional in the source —
// straightforward class-based error boundary (only way to catch render
// errors in React; no hook equivalent exists). Rebuilt on our own Button
// primitive instead of a raw <button>, real theme-token styling instead of
// unstyled <div>/<h2>, and an onError callback instead of a bare
// console.log so a consumer can actually do something with the error
// (report it, etc.) rather than just seeing it in the console.

import { Component, type ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"
import { AlertTriangleIcon } from "lucide-react"

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered in place of children once an error is caught. Receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div data-slot="error-boundary" className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertTriangleIcon className="size-5 text-destructive" />
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="max-w-xs text-xs text-muted-foreground">{error.message}</p>
        <Button size="sm" variant="outline" onClick={this.reset}>
          Try again
        </Button>
      </div>
    )
  }
}

export { ErrorBoundary }
export type { ErrorBoundaryProps }
