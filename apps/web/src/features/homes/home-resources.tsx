import { Lightbox } from "@workspace/ui/components/image/lightbox"
import { Image } from "@workspace/ui/components/image/image"
import { cn } from "@workspace/ui/lib/utils"

import { HomeRow } from "./home-row"
import type { ResourceRow } from "./types"

const RESOURCE_KIND_LABEL: Record<ResourceRow["kind"], string> = {
  artifact: "Artifact",
  evidence: "Evidence",
  knowledge: "Knowledge",
  "saved-view": "Saved view",
}

type PreviewableImage = ResourceRow & {
  readonly mediaType: string
  readonly nativeHref: string
}

export function isPreviewableImage(
  resource: ResourceRow,
): resource is PreviewableImage {
  return Boolean(
    resource.nativeHref && resource.mediaType?.startsWith("image/"),
  )
}

export function HomeResources({
  resources,
  compact,
  showKind = false,
}: {
  readonly resources: readonly ResourceRow[]
  readonly compact?: boolean
  readonly showKind?: boolean
}) {
  const images = resources.filter(isPreviewableImage)
  const rows = resources.filter((resource) => !isPreviewableImage(resource))

  return (
    <>
      {images.length > 0 ? (
        <div role="group" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((resource, index) => (
            <div key={resource.id} role="listitem">
              <Lightbox
                src={resource.nativeHref}
                alt={resource.name}
                caption={resource.name}
              >
                <button
                  type="button"
                  data-home-row
                  tabIndex={index === 0 ? 0 : -1}
                  aria-label={`Preview ${resource.name}`}
                  className="group/image-artifact block min-h-11 w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted text-left outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <Image
                    src={resource.nativeHref}
                    alt=""
                    ratio="4/3"
                    rounded="none"
                    className="transition-opacity group-hover/image-artifact:opacity-90"
                  />
                  <span
                    className={cn(
                      "block truncate px-2.5 py-2 text-sm text-foreground",
                      compact && "px-2 py-1.5 text-xs",
                    )}
                  >
                    {resource.name}
                  </span>
                </button>
              </Lightbox>
            </div>
          ))}
        </div>
      ) : null}

      {rows.map((resource, index) => (
        <HomeRow
          key={resource.id}
          first={images.length === 0 && index === 0}
          compact={compact}
          title={resource.name}
          nativeHref={resource.nativeHref}
          description={
            resource.mountedFromName
              ? `Shared from ${resource.mountedFromName}`
              : undefined
          }
          trailing={
            showKind ? (
              <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                {RESOURCE_KIND_LABEL[resource.kind]}
              </span>
            ) : undefined
          }
        />
      ))}
    </>
  )
}
