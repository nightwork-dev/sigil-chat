// Settings → Appearance: the existing theme + mode system (unchanged,
// surfaced via ThemePickerExpanded — chrome ThemePicker stays in the top bar,
// this is additional) plus the new registry-backed reducedMotion preference.

import { useEffect } from "react"

import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"
import { SectionHeader } from "@workspace/ui/components/section-header"

import { ThemePickerExpanded } from "@/components/theme-picker"
import { useSetUserSetting, useUserSetting } from "@/lib/user-settings"

// Toggling a DOM class on <html> from a resolved preference is a DOM/external
// sync (like theme.tsx's own initTheme mount sync), not derived render state —
// there is nowhere else to "put" this as non-effect state.
function useReducedMotionClass(enabled: boolean | undefined) {
  useEffect(() => {
    if (enabled === undefined) return
    document.documentElement.classList.toggle("reduce-motion", enabled)
  }, [enabled])
}

export function AppearanceSection({ userId }: { userId: string }) {
  const reducedMotion = useUserSetting(userId, "appearance.reducedMotion")
  const setReducedMotion = useSetUserSetting(userId, "appearance.reducedMotion")

  useReducedMotionClass(reducedMotion.data?.value)

  function handleToggle(next: boolean) {
    document.documentElement.classList.toggle("reduce-motion", next)
    setReducedMotion.mutate({
      scopeKind: "user",
      scopeId: "",
      value: next,
      expectedRevision: reducedMotion.data?.revision ?? undefined,
    })
  }

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <SectionHeader>Theme &amp; mode</SectionHeader>
        <ThemePickerExpanded />
      </section>

      <section className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="reduced-motion">Reduce motion</Label>
          <p className="text-xs text-muted-foreground">
            Turn off color and layout transitions across the app, independent
            of your OS setting.
          </p>
        </div>
        <Switch
          id="reduced-motion"
          checked={reducedMotion.data?.value ?? false}
          disabled={reducedMotion.isLoading || setReducedMotion.isPending}
          onCheckedChange={handleToggle}
        />
      </section>
    </div>
  )
}
