// SettingsPage: vertical section rail (Account / Security / Appearance /
// Agent) inside the existing _app chrome — deliberately NOT the standalone
// SettingsShell from @workspace/ui (that shell owns its own header/viewport;
// nesting it inside SidebarShell would duplicate chrome). Notifications is
// hidden until a real notification transport exists (spec).

import {
  BoxesIcon,
  ChartColumnIcon,
  KeyRoundIcon,
  PaletteIcon,
  SlidersHorizontalIcon,
  UserIcon,
} from "lucide-react"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import type { CurrentSessionUser } from "@/lib/auth/route-guard"
import type { LoginMethods } from "@/lib/auth/login-methods"
import { AccountSection } from "./account-section"
import { AgentSection } from "./agent-section"
import { AppearanceSection } from "./appearance-section"
import { ModelsSection } from "./models-section"
import { SecuritySection } from "./security-section"
import { UsageSection } from "./usage-section"
import { type AttentionContext } from "@zigil/agent/react"
import { useAttentionTelemetry } from "@zigil/agent/react"
import { usePublishWorkspaceAttention } from "@/components/agent/workspace-attention"

export type SettingsSection =
  | "account"
  | "security"
  | "appearance"
  | "agent"
  | "models"
  | "usage"

const SETTINGS_TABS: {
  value: SettingsSection
  label: string
  icon: typeof UserIcon
}[] = [
  { value: "account", label: "Account", icon: UserIcon },
  { value: "security", label: "Security", icon: KeyRoundIcon },
  { value: "appearance", label: "Appearance", icon: PaletteIcon },
  { value: "agent", label: "Agent", icon: SlidersHorizontalIcon },
  { value: "models", label: "Models", icon: BoxesIcon },
  { value: "usage", label: "Usage", icon: ChartColumnIcon },
]

export function SettingsPage({
  user,
  section,
  onSectionChange,
  loginMethods,
  providerLinkError,
}: {
  user: CurrentSessionUser
  section: SettingsSection
  onSectionChange: (section: SettingsSection) => void
  loginMethods: LoginMethods
  providerLinkError: boolean
}) {
  // Attention coverage: the selected settings section flows into
  // agent context, so "change my theme" / "explain this setting" have a target.
  // Models reads deployment-wide model configuration and credential status,
  // which the server functions behind it already restrict to the owner. The
  // tab follows that restriction so a member is never shown a section whose
  // only possible content is a permission error.
  const isOwner = user.role === "owner"
  const tabs = SETTINGS_TABS.filter(
    (tab) => (tab.value !== "models" && tab.value !== "usage") || isOwner,
  )
  const activeSection = tabs.some((tab) => tab.value === section)
    ? section
    : "account"

  const telemetry = useAttentionTelemetry()
  const attention: AttentionContext = {
    application: "sigil-chat",
    route: "/settings",
    workspace: { kind: "settings", id: "settings", label: "Settings" },
    selection: {
      kind: "settings-section",
      id: activeSection,
      label:
        tabs.find((tab) => tab.value === activeSection)?.label ?? activeSection,
    },
    history: telemetry.history,
  }
  usePublishWorkspaceAttention(attention)

  return (
    // No page-level <h1>: the _app breadcrumb bar already names this place.
    // Restating "Settings" directly beneath it reads as two places, and the
    // section rail below names which part of Settings you are in.
    <div className="flex h-full min-h-0 flex-col">
      <Tabs
        orientation="vertical"
        value={activeSection}
        onValueChange={(value) => onSectionChange(value as SettingsSection)}
        className="min-h-0 flex-1 flex-row! gap-0 p-3"
      >
        <TabsList
          variant="line"
          className="h-fit w-auto shrink-0 flex-col items-stretch bg-transparent p-0 sm:w-40"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              title={tab.label}
              className="justify-center gap-2 px-2 sm:justify-start"
            >
              <tab.icon />
              {/* Labels would starve the content column at phone widths; the
                  rail is icon-only on mobile (title keeps them discoverable). */}
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* pb-16 keeps the last row (e.g. the Security session list) scrollable
            clear of the floating agent HUD pinned bottom-right. */}
        <div className="min-h-0 flex-1 overflow-auto pb-16">
          <TabsContent value="account">
            <AccountSection user={user} />
          </TabsContent>
          <TabsContent value="security">
            <SecuritySection
              isOwner={isOwner}
              loginMethods={loginMethods}
              providerLinkError={providerLinkError}
              userId={user.id}
            />
          </TabsContent>
          <TabsContent value="appearance">
            <AppearanceSection userId={user.id} />
          </TabsContent>
          <TabsContent value="agent">
            <AgentSection userId={user.id} />
          </TabsContent>
          {isOwner ? (
            <TabsContent value="models">
              <ModelsSection userId={user.id} />
            </TabsContent>
          ) : null}
          {isOwner ? (
            <TabsContent value="usage">
              <UsageSection />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </div>
  )
}
