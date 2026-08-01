// Settings → Appearance: the existing theme + mode system (unchanged,
// surfaced via ThemePickerExpanded — chrome ThemePicker stays in the top bar,
// this is additional) plus the new registry-backed reducedMotion preference.

import { useEffect } from "react"

import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"
import { SectionHeader } from "@workspace/ui/components/section-header"

import { ThemePickerExpanded } from "@/components/theme-picker"
import {
  SettingsNote,
  SettingsPanel,
  SettingsSection,
} from "@/features/settings/settings-panel"
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
    <SettingsPanel width="xl">
      {/* Borderless on purpose: the theme picker is its own bordered grid, and
          a block around it would double the frame. */}
      <section className="flex flex-col gap-2">
        <SectionHeader>Theme &amp; mode</SectionHeader>
        <ThemePickerExpanded />
      </section>

      <SettingsSection layout="row">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="reduced-motion">Reduce motion</Label>
          <SettingsNote>
            Turn off color and layout transitions across the app, independent of
            your OS setting.
          </SettingsNote>
        </div>
        <Switch
          id="reduced-motion"
          checked={reducedMotion.data?.value ?? false}
          disabled={reducedMotion.isLoading || setReducedMotion.isPending}
          onCheckedChange={handleToggle}
        />
      </SettingsSection>
    </SettingsPanel>
  )
}
