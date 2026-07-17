import { Link } from "@tanstack/react-router"
import { Card, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import {
  PanelLeftIcon,
  MenuIcon,
  MonitorIcon,
  MessageSquareIcon,
  PenToolIcon,
  DatabaseIcon,
  PaletteIcon,
  BookOpenIcon,
  FileTextIcon,
  RocketIcon,
  ColumnsIcon,
  PanelRightIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react"

// The gallery lists every example by its real route — including three
// (/examples/docs, /examples/report, /examples/landing) owned by a parallel
// lane that may not exist yet. Linking them anyway is expected; they 404
// until that work lands.
interface ExampleEntry {
  to: string
  icon: LucideIcon
  title: string
  description: string
  demonstrates: string
}

const EXAMPLES: ExampleEntry[] = [
  {
    to: "/dashboard",
    icon: PanelLeftIcon,
    title: "Sidebar",
    description: "Collapsible icon sidebar with breadcrumb bar.",
    demonstrates: "Chrome shell — Cmd+B collapse; dashboard, chat, canvas, entity-browser views.",
  },
  {
    to: "/menubar",
    icon: MenuIcon,
    title: "Menubar",
    description: "Desktop app-style File/Edit/View menubar.",
    demonstrates: "Chrome shell — menubar + tabs, workflow editor.",
  },
  {
    to: "/footer",
    icon: MonitorIcon,
    title: "Footer",
    description: "Header tab nav with a persistent status strip.",
    demonstrates: "Chrome shell — chat-first single-surface layout.",
  },
  {
    to: "/split",
    icon: ColumnsIcon,
    title: "Split",
    description: "Resizable master-detail two-pane inbox.",
    demonstrates: "InboxView — click a row, detail updates in place across both panes.",
  },
  {
    to: "/inspector",
    icon: PanelRightIcon,
    title: "Inspector",
    description: "Content with a collapsible right properties rail.",
    demonstrates: "Layout shell — Cmd+. toggles the inspector.",
  },
  {
    to: "/settings",
    icon: SlidersHorizontalIcon,
    title: "Settings",
    description: "Section nav with a settings content pane.",
    demonstrates: "Layout shell — the classic preferences shape.",
  },
  {
    to: "/examples/chat",
    icon: MessageSquareIcon,
    title: "Chat",
    description: "Message rendering, streaming, and a compose bar.",
    demonstrates: "@workspace/chat component catalog.",
  },
  {
    to: "/examples/canvas",
    icon: PenToolIcon,
    title: "Canvas",
    description: "Spatial editor primitives and grid rendering.",
    demonstrates: "@workspace/canvas + @workspace/graph component catalog.",
  },
  {
    to: "/examples/data",
    icon: DatabaseIcon,
    title: "Data",
    description: "Entity tables, browsers, and detail panels.",
    demonstrates: "@workspace/data component catalog.",
  },
  {
    to: "/examples/playground",
    icon: PaletteIcon,
    title: "Playground",
    description: "Live theme-token derivation sandbox.",
    demonstrates: "5-parameter theme variant explorer with CSS export.",
  },
  {
    to: "/examples/docs",
    icon: BookOpenIcon,
    title: "Docs",
    description: "Documentation-site layout on GuideShell.",
    demonstrates: "Two-pane scroll-spy docs shell.",
  },
  {
    to: "/examples/report",
    icon: FileTextIcon,
    title: "Report",
    description: "Print-friendly report layout.",
    demonstrates: "Dense tabular data with a print stylesheet.",
  },
  {
    to: "/examples/landing",
    icon: RocketIcon,
    title: "Landing",
    description: "Marketing page layout.",
    demonstrates: "Hero, feature grid, and CTA composition.",
  },
]

export function ExamplesGallery() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Examples</h1>
        <p className="text-sm text-muted-foreground">
          Assembled demo apps — whole compositions built from the canonical Layouts, Views, and Blocks. Browse the parts on their own in the{" "}
          <Link to="/gallery" className="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground">
            Gallery
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {EXAMPLES.map((example) => (
          <Link key={example.to} to={example.to} className="group">
            <Card className="h-full transition-colors group-hover:ring-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <example.icon className="size-4 text-primary" />
                  {example.title}
                </CardTitle>
                <CardDescription className="text-xs">{example.description}</CardDescription>
              </CardHeader>
              <p className="px-6 pb-4 text-[10px] font-mono text-muted-foreground">{example.demonstrates}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
