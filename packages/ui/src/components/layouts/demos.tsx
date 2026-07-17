// Placeholder content for the three new Layout shells. Deliberately minimal
// and honest — enough to render each shell and drive its affordances (select
// a row, toggle the inspector, switch settings sections). The real Views land
// in a later tranche; this is scaffolding to verify the chrome, not fake depth.

import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldContent,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { DataLabel } from "@workspace/ui/components/data-label"
import { PageHeader } from "@workspace/ui/components/blocks/page-header"
import { PropertyPanel } from "@workspace/ui/components/blocks/property-panel"

// NOTE: the Split / master-detail placeholders that once lived here were
// replaced by the canonical InboxView (components/views/inbox.tsx), which now
// fills the SplitShell at /split. Inspector + Settings placeholders remain
// until their own canonical Views land in a later tranche.

// ─── Inspector (content + right rail) ────────────────────────────────────────

export function InspectorMain() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <PageHeader title="Untitled document" />
      <p className="text-sm leading-relaxed text-muted-foreground">
        Main content region. The right rail holds properties for whatever is
        selected here. Toggle it from the header button or press Cmd+. — the
        rail collapses so the content can use the full width.
      </p>
      <div className="h-40 rounded-md border border-dashed border-border" />
    </div>
  )
}

export function InspectorPanel() {
  return (
    <PropertyPanel.Root>
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="insp-name">Name</FieldLabel>
          <Input id="insp-name" defaultValue="Untitled" className="h-7 max-w-[9rem] text-xs" />
        </Field>
        <Field orientation="horizontal">
          <FieldLabel htmlFor="insp-visible">Visible</FieldLabel>
          <Switch id="insp-visible" defaultChecked />
        </Field>
      </FieldGroup>
      <PropertyPanel.Grid>
        <DataLabel label="Width" value="640" />
        <DataLabel label="Height" value="480" />
        <DataLabel label="X" value="0" />
        <DataLabel label="Y" value="0" />
      </PropertyPanel.Grid>
    </PropertyPanel.Root>
  )
}

// ─── Settings sections ───────────────────────────────────────────────────────
// Deliberative surface, read once — so controls carry help text (ux skill).

export function SettingsGeneral() {
  return (
    <SettingsSection title="General" description="Workspace-wide preferences.">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="ws-name">Workspace name</FieldLabel>
          <Input id="ws-name" defaultValue="Acme" className="max-w-sm" />
          <FieldDescription>Shown in the sidebar and on shared links.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="ws-email">Billing email</FieldLabel>
          <Input id="ws-email" type="email" defaultValue="billing@acme.co" className="max-w-sm" />
          <FieldDescription>Invoices and receipts are sent here.</FieldDescription>
        </Field>
      </FieldGroup>
    </SettingsSection>
  )
}

// Decoupled: the theme picker is app-specific wiring, so the app injects it as
// children rather than the package importing it (spec §5).
export function SettingsAppearance({ children }: { children?: React.ReactNode }) {
  return (
    <SettingsSection title="Appearance" description="Pick the thermal envelope for the whole app.">
      {children}
    </SettingsSection>
  )
}

const NOTIFICATIONS = [
  { id: "deploys", label: "Deploys", description: "When a build finishes or fails.", on: true },
  { id: "alerts", label: "Alerts", description: "Latency, error-rate, and uptime thresholds.", on: true },
  { id: "digest", label: "Weekly digest", description: "A Monday summary of the week's traffic.", on: false },
]

export function SettingsNotifications() {
  return (
    <SettingsSection title="Notifications" description="Choose which events reach you by email.">
      <FieldGroup>
        {NOTIFICATIONS.map((n) => (
          <Field key={n.id} orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={`notif-${n.id}`}>{n.label}</FieldLabel>
              <FieldDescription>{n.description}</FieldDescription>
            </FieldContent>
            <Switch id={`notif-${n.id}`} defaultChecked={n.on} />
          </Field>
        ))}
      </FieldGroup>
    </SettingsSection>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-6">
      <PageHeader title={title} description={description} />
      {children}
    </div>
  )
}
