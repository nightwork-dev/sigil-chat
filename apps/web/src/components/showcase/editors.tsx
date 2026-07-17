import { useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { TemplateResolver } from "@workspace/ui/components/template-resolver"
import { DataFormatEditor } from "@workspace/ui/components/data-format-editor"
import type { DataFormat } from "@workspace/ui/lib/data-format"
import { ClickToEdit } from "@workspace/ui/components/click-to-edit"
import { PopoverEditSlider } from "@workspace/ui/components/popover-edit-slider"
import { PopoverEditSelect } from "@workspace/ui/components/popover-edit-select"
import { PopoverEdit } from "@workspace/ui/components/popover-edit"
import { KeyValueEditor } from "@workspace/ui/components/key-value-editor"
import { CliArgumentBuilder, type ArgumentDefinition } from "@workspace/ui/components/cli-argument-builder"
import { EntityPanel, type EntityPanelEntity } from "@workspace/ui/components/entity-panel"
import { ValidatedDraft, type ValidationResult } from "@workspace/ui/components/validated-draft"
import { Exhibit } from "@/components/showcase/exhibit"

// Editors — surfaces for editing structured data or text and committing the
// change: inline rename, key/value maps, argument forms, template/format
// editors, and entity panels. The commit step (and its validation) is the
// through-line; a visual/canvas authoring tool lives in Creative, a
// summoned menu in Overlays.

const CLI_ARGUMENT_DEFINITIONS: ArgumentDefinition[] = [
  { name: "name", type: "string", required: true, description: "The user's full name", placeholder: "Enter your name" },
  { name: "age", type: "number", description: "Age in years", validation: (v) => (Number(v) >= 0 && Number(v) <= 150) || "Age must be between 0 and 150" },
  { name: "role", type: "string", options: ["admin", "user", "moderator"], description: "User role", defaultValue: "user" },
  { name: "active", type: "boolean", description: "Whether the user is active", defaultValue: true },
  { name: "tags", type: "array", description: "User tags (comma-separated)", placeholder: "tag1, tag2, tag3" },
]

function validateEntity(data: unknown): ValidationResult {
  if (typeof data !== "object" || data === null) return { valid: false, error: "Expected an object" }
  const obj = data as Record<string, unknown>
  if (typeof obj.name !== "string" || obj.name.length === 0) {
    return { valid: false, error: "'name' must be a non-empty string" }
  }
  return { valid: true }
}

export function EditorsShowcase() {
  const [template, setTemplate] = useState("{greeting}, {name}! {ctx.last}")
  const [templateVars, setTemplateVars] = useState<Record<string, string>>({
    greeting: "Hello",
    name: "{role} {codename}",
    role: "Agent",
    codename: "Sigil",
    "ctx.last": "Following up on the {topic} discussion.",
    topic: "Q3 roadmap",
  })

  const [dataFormat, setDataFormat] = useState<DataFormat>("json")
  const [dataText, setDataText] = useState(
    JSON.stringify({ name: "Sigil Design", version: 2, stable: true, tags: ["ui", "tokens"] }, null, 2)
  )

  const [editableName, setEditableName] = useState("Sigil Design")
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    SYSTEM: "You are a helpful assistant.",
    INPUT: "",
  })

  const [entity, setEntity] = useState<EntityPanelEntity>({
    id: "1",
    name: "Ambient Pad",
    description: "A slow-attack synth voice",
    visible: true,
  })

  const [draftData, setDraftData] = useState<Record<string, unknown>>({ name: "Ambient Pad" })

  // PopoverEdit transactional edits — close commits, Escape discards.
  const [drive, setDrive] = useState(40)
  const [role, setRole] = useState("user")
  const [priority, setPriority] = useState(3)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Template Resolver" subtitle="recursive {variable} substitution — a variable's value can itself reference further variables" className="lg:col-span-2" installName="template-resolver">
        <TemplateResolver.Root template={template} vars={templateVars} onTemplateChange={setTemplate} onVarsChange={setTemplateVars}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Template</span>
              <TemplateResolver.Editor />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Variables</span>
              <TemplateResolver.VariableList />
            </div>
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Resolved</span>
              <TemplateResolver.Preview />
            </div>
          </div>
        </TemplateResolver.Root>
      </Exhibit>

      <Exhibit title="Data Format Editor" subtitle="JSON / JSON5 / YAML — switch formats, the data carries over" className="lg:col-span-2" installName="data-format-editor">
        <DataFormatEditor value={dataText} format={dataFormat} onValueChange={setDataText} onFormatChange={setDataFormat} />
      </Exhibit>

      <Exhibit title="CLI Argument Builder" subtitle="Argument.Root/Label/Control/Error/TypeBadge compound" className="lg:col-span-2" installName="cli-argument-builder">
        <CliArgumentBuilder definitions={CLI_ARGUMENT_DEFINITIONS} />
      </Exhibit>

      <Exhibit title="Entity Panel" subtitle="click-to-edit header + actions menu" installName="entity-panel">
        <EntityPanel.Root
          entity={entity}
          editable
          actions={{
            onRename: (name) => setEntity((e) => ({ ...e, name })),
            onDescribe: (description) => setEntity((e) => ({ ...e, description })),
            onVisibilityChange: (visible) => setEntity((e) => ({ ...e, visible })),
            onDuplicate: () => {},
            onDelete: () => {},
          }}
        >
          <EntityPanel.Header />
          <EntityPanel.Content>
            <p className="text-xs text-muted-foreground">Click the name or description to edit.</p>
          </EntityPanel.Content>
        </EntityPanel.Root>
      </Exhibit>

      <Exhibit title="Key/Value Editor" subtitle="dirty-tracked field list" installName="key-value-editor">
        <KeyValueEditor
          values={fieldValues}
          alwaysShow={["SYSTEM", "INPUT"]}
          onCommit={(key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }))}
        />
      </Exhibit>

      <Exhibit title="Click to Edit" subtitle="click text, type or paste, then Enter or blur to rename" installName="click-to-edit">
        <div className="flex flex-col items-center gap-2 py-2">
          <ClickToEdit value={editableName} onCommit={setEditableName} className="text-sm" />
          <span className="text-xs text-muted-foreground">Saved: {editableName}</span>
        </div>
      </Exhibit>

      <Exhibit title="Validated Draft" subtitle="schema-gated commit" installName="validated-draft">
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={() => setDraftData({})}>
            Clear name
          </Button>
          <ValidatedDraft data={draftData} validate={validateEntity} onCommit={() => {}} />
        </div>
      </Exhibit>

      <Exhibit
        title="Popover Edit · Shell"
        subtitle="render-prop control · commit-on-close"
        installName="popover-edit"
      >
        <div className="flex flex-col items-start gap-2 py-2">
          <span className="text-xs text-muted-foreground">
            Priority: <span className="font-mono text-foreground">{priority}</span>
          </span>
          {/* Raw shell: a custom stepper control wired to the draft API. The
              shell owns the transaction; the control only reads/writes draft. */}
          <PopoverEdit
            value={priority}
            onValueChange={setPriority}
            label="Priority"
            hint="Close to apply · Esc to cancel"
          >
            {({ draft, setDraft }) => (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(Math.max(0, draft - 1))}
                >
                  −
                </Button>
                <span className="w-8 text-center font-mono text-sm tabular-nums">{draft}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDraft(Math.min(9, draft + 1))}
                >
                  +
                </Button>
              </div>
            )}
          </PopoverEdit>
        </div>
      </Exhibit>

      <Exhibit
        title="Popover Edit · Slider"
        subtitle="value is the trigger · close commits · Esc discards"
        installName="popover-edit-slider"
      >
        <div className="flex flex-col items-start gap-2 py-2">
          <span className="text-xs text-muted-foreground">
            Drive intensity: <span className="font-mono text-foreground">{drive}</span>
          </span>
          <PopoverEditSlider
            value={drive}
            onValueChange={setDrive}
            label="Drive intensity"
            min={0}
            max={100}
            format={(n) => `${n}`}
            hint="Close to apply · Esc to cancel"
          />
        </div>
      </Exhibit>

      <Exhibit
        title="Popover Edit · Select"
        subtitle="pick one · close commits · Esc discards"
        installName="popover-edit-select"
      >
        <div className="flex flex-col items-start gap-2 py-2">
          <span className="text-xs text-muted-foreground">
            Role: <span className="font-mono text-foreground">{role}</span>
          </span>
          <PopoverEditSelect
            value={role}
            onValueChange={setRole}
            label="Role"
            options={[
              { value: "admin", label: "Admin" },
              { value: "user", label: "User" },
              { value: "moderator", label: "Moderator" },
              { value: "guest", label: "Guest" },
            ]}
          />
        </div>
      </Exhibit>
    </div>
  )
}
