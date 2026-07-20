import { RefreshCwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { StatusDot } from "@workspace/ui/components/status-dot"

import { useSystemStatus } from "@/lib/system-status"

export function StatusWorkspace() {
  const status = useSystemStatus()

  return (
    <div className="h-full overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-20">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <div>
            <h1 className="text-base font-semibold">System status</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live dependency checks for this Sigil instance.
            </p>
          </div>
          <Button
            disabled={status.isFetching}
            onClick={() => void status.refetch()}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon className={status.isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </div>

        {status.isError ? (
          <p className="text-sm text-destructive">
            Status checks are unavailable. Try again shortly.
          </p>
        ) : status.data ? (
          <>
            <section aria-labelledby="service-health-heading">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium" id="service-health-heading">
                  Services
                </h2>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(status.data.checkedAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {status.data.services.map((service) => (
                  <div
                    className="flex min-h-14 items-center justify-between gap-4 py-3"
                    key={service.id}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{service.label}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {service.latencyMs} ms
                      </p>
                    </div>
                    <StatusDot
                      label={service.status}
                      status={service.status === "healthy" ? "success" : "destructive"}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section aria-labelledby="usage-heading" className="border-t border-border pt-4">
              <h2 className="text-sm font-medium" id="usage-heading">
                Model usage
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Token accounting is not connected yet. Health data above is live;
                this section will remain explicit rather than estimating usage.
              </p>
            </section>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Checking services…</p>
        )}
      </div>
    </div>
  )
}
