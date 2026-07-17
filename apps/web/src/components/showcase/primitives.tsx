import { useState } from "react"
import { PaperclipIcon, ChevronRightIcon, HomeIcon, StarIcon } from "lucide-react"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@workspace/ui/components/accordion"
import { Alert, AlertTitle, AlertDescription } from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@workspace/ui/components/alert-dialog"
import { AspectRatio } from "@workspace/ui/components/aspect-ratio"
import { Attachment, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription } from "@workspace/ui/components/attachment"
import { Avatar, AvatarFallback, AvatarGroup } from "@workspace/ui/components/avatar"
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Calendar } from "@workspace/ui/components/calendar"
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@workspace/ui/components/carousel"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@workspace/ui/components/collapsible"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@workspace/ui/components/command"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@workspace/ui/components/context-menu"
import { FacetedFilter, type FacetedFilterOption } from "@workspace/ui/components/faceted-filter"
import { Field, FieldLabel, FieldDescription } from "@workspace/ui/components/field"
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@workspace/ui/components/hover-card"
import { Input } from "@workspace/ui/components/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@workspace/ui/components/input-otp"
import { Item, ItemMedia, ItemContent, ItemTitle, ItemDescription } from "@workspace/ui/components/item"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Marker, MarkerContent } from "@workspace/ui/components/marker"
import { Message, MessageAvatar, MessageContent } from "@workspace/ui/components/message"
import { NativeSelect } from "@workspace/ui/components/native-select"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "@workspace/ui/components/navigation-menu"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from "@workspace/ui/components/pagination"
import { Progress } from "@workspace/ui/components/progress"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@workspace/ui/components/resizable"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@workspace/ui/components/tabs"
import { ToggleGroup, ToggleGroupItem } from "@workspace/ui/components/toggle-group"
import { InstallSnippet } from "@workspace/ui/components/install-snippet"
import { isNew } from "@workspace/ui/lib/component-meta"
import { NewTag } from "@/components/showcase/exhibit"

// A dense reference sheet for the stock shadcn primitives that don't get
// their own curated exhibit elsewhere in /showcase — one compact example
// per component, not a full interaction walkthrough. For anything that
// needs real design attention (colors, variants, composition), reach for
// shadcn's own docs; this page exists so you know the primitive is here.

// No ExhibitCard here (these are single-line reference swatches, not
// expandable exhibits with controls), so installName wiring reuses the
// same InstallSnippet directly in the label row rather than restructuring
// the page onto ExhibitCard — the snippet's own short-label form (see
// install-snippet.tsx) already fits this narrower header without needing
// a separate compact variant.
function Swatch({ label, installName, children }: { label: string; installName?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          {/* "New" tag: same auto-derived, auto-expiring recently-added signal
              as the Exhibit frame (isNew, SSR-safe baked reference). */}
          {installName && isNew(installName) && <NewTag />}
        </span>
        {installName && <InstallSnippet name={installName} />}
      </div>
      {children}
    </div>
  )
}

const FILTER_OPTIONS: FacetedFilterOption[] = [
  { label: "Backlog", value: "backlog" },
  { label: "In Progress", value: "in-progress" },
  { label: "Done", value: "done" },
]
const FILTER_FACETS = new Map([
  ["backlog", 4],
  ["in-progress", 2],
  ["done", 11],
])

export function PrimitivesShowcase() {
  const [cmdOpen, setCmdOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string[]>([])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-6">
      <Swatch label="Accordion" installName="accordion">
        <Accordion defaultValue={["a"]} className="w-full">
          <AccordionItem value="a">
            <AccordionTrigger>Is it accessible?</AccordionTrigger>
            <AccordionContent>Yes, follows WAI-ARIA.</AccordionContent>
          </AccordionItem>
        </Accordion>
      </Swatch>

      <Swatch label="Alert" installName="alert">
        <Alert>
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Something you should know.</AlertDescription>
        </Alert>
      </Swatch>

      <Swatch label="Alert Dialog" installName="alert-dialog">
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Swatch>

      <Swatch label="Aspect Ratio" installName="aspect-ratio">
        <AspectRatio ratio={16 / 9} className="rounded-md bg-muted" />
      </Swatch>

      <Swatch label="Attachment" installName="attachment">
        <Attachment>
          <AttachmentMedia>
            <PaperclipIcon className="size-4" />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>report.pdf</AttachmentTitle>
            <AttachmentDescription>2.4 MB</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      </Swatch>

      <Swatch label="Avatar" installName="avatar">
        <AvatarGroup>
          <Avatar><AvatarFallback>AB</AvatarFallback></Avatar>
          <Avatar><AvatarFallback>CD</AvatarFallback></Avatar>
          <Avatar><AvatarFallback>EF</AvatarFallback></Avatar>
        </AvatarGroup>
      </Swatch>

      <Swatch label="Bubble" installName="bubble">
        <Bubble variant="default">
          <BubbleContent>Hey, how's it going?</BubbleContent>
        </Bubble>
      </Swatch>

      <Swatch label="Button Group" installName="button-group">
        <ButtonGroup>
          <Button variant="outline" size="sm">Left</Button>
          <Button variant="outline" size="sm">Mid</Button>
          <Button variant="outline" size="sm">Right</Button>
        </ButtonGroup>
      </Swatch>

      <Swatch label="Calendar" installName="calendar">
        <Calendar className="p-0" />
      </Swatch>

      <Swatch label="Carousel" installName="carousel">
        <Carousel className="w-full max-w-[180px]">
          <CarouselContent>
            {[1, 2, 3].map((i) => (
              <CarouselItem key={i}>
                <div className="flex aspect-square items-center justify-center rounded-md bg-muted font-mono text-lg">{i}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </Swatch>

      <Swatch label="Checkbox" installName="checkbox">
        <div className="flex items-center gap-2">
          <Checkbox id="prim-cb" defaultChecked />
          <label htmlFor="prim-cb" className="text-xs">Accept terms</label>
        </div>
      </Swatch>

      <Swatch label="Collapsible" installName="collapsible">
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>Toggle</CollapsibleTrigger>
          <CollapsibleContent className="text-xs text-muted-foreground">Hidden content revealed.</CollapsibleContent>
        </Collapsible>
      </Swatch>

      <Swatch label="Command (Cmd+K)" installName="command">
        <Button variant="outline" size="sm" onClick={() => setCmdOpen(true)}>
          Open <Kbd className="ml-1.5">⌘K</Kbd>
        </Button>
        <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
          <CommandInput placeholder="Type a command..." />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem>New file</CommandItem>
              <CommandItem>Open folder</CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </Swatch>

      <Swatch label="Context Menu" installName="context-menu">
        <ContextMenu>
          <ContextMenuTrigger className="flex h-16 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
            Right-click
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Copy</ContextMenuItem>
            <ContextMenuItem>Paste</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Swatch>

      <Swatch label="Faceted Filter" installName="faceted-filter">
        <FacetedFilter.Root title="Status" options={FILTER_OPTIONS} value={statusFilter} onValueChange={setStatusFilter} facets={FILTER_FACETS}>
          <FacetedFilter.Trigger />
          <FacetedFilter.List />
        </FacetedFilter.Root>
      </Swatch>

      <Swatch label="Field" installName="field">
        <Field>
          <FieldLabel htmlFor="prim-field">Email</FieldLabel>
          <Input id="prim-field" type="email" placeholder="you@example.com" />
          <FieldDescription>We'll never share it.</FieldDescription>
        </Field>
      </Swatch>

      <Swatch label="Hover Card" installName="hover-card">
        <HoverCard>
          <HoverCardTrigger render={<Button variant="link" size="sm" />}>@username</HoverCardTrigger>
          <HoverCardContent className="text-xs">Joined March 2024.</HoverCardContent>
        </HoverCard>
      </Swatch>

      <Swatch label="Input OTP" installName="input-otp">
        <InputOTP maxLength={4}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
          </InputOTPGroup>
        </InputOTP>
      </Swatch>

      <Swatch label="Item" installName="item">
        <Item>
          <ItemMedia><StarIcon className="size-4" /></ItemMedia>
          <ItemContent>
            <ItemTitle>Starred</ItemTitle>
            <ItemDescription>Pinned to the top</ItemDescription>
          </ItemContent>
        </Item>
      </Swatch>

      <Swatch label="Kbd" installName="kbd">
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>Shift</Kbd>
          <Kbd>T</Kbd>
        </KbdGroup>
      </Swatch>

      <Swatch label="Marker" installName="marker">
        <Marker>
          <MarkerContent>New</MarkerContent>
        </Marker>
      </Swatch>

      <Swatch label="Message" installName="message">
        <Message>
          <MessageAvatar className="flex items-center justify-center text-[10px] font-medium">AI</MessageAvatar>
          <MessageContent>Here's what I found.</MessageContent>
        </Message>
      </Swatch>

      <Swatch label="Native Select" installName="native-select">
        <NativeSelect defaultValue="b">
          <option value="a">Option A</option>
          <option value="b">Option B</option>
        </NativeSelect>
      </Swatch>

      <Swatch label="Navigation Menu" installName="navigation-menu">
        <NavigationMenu>
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuLink href="#" className="text-xs">
                <HomeIcon className="size-3.5" /> Home
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </Swatch>

      <Swatch label="Pagination" installName="pagination">
        <Pagination>
          <PaginationContent>
            <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
            <PaginationItem><PaginationLink href="#" isActive>1</PaginationLink></PaginationItem>
            <PaginationItem><PaginationLink href="#">2</PaginationLink></PaginationItem>
            <PaginationItem><PaginationNext href="#" /></PaginationItem>
          </PaginationContent>
        </Pagination>
      </Swatch>

      <Swatch label="Progress" installName="progress">
        <Progress value={62} />
      </Swatch>

      <Swatch label="Radio Group" installName="radio-group">
        <RadioGroup defaultValue="a" className="flex gap-3">
          <div className="flex items-center gap-1.5"><RadioGroupItem value="a" id="prim-ra" /><label htmlFor="prim-ra" className="text-xs">A</label></div>
          <div className="flex items-center gap-1.5"><RadioGroupItem value="b" id="prim-rb" /><label htmlFor="prim-rb" className="text-xs">B</label></div>
        </RadioGroup>
      </Swatch>

      <Swatch label="Resizable" installName="resizable">
        <ResizablePanelGroup orientation="horizontal" className="h-16 rounded-md border">
          <ResizablePanel className="flex items-center justify-center text-[10px] text-muted-foreground">L</ResizablePanel>
          <ResizableHandle />
          <ResizablePanel className="flex items-center justify-center text-[10px] text-muted-foreground">R</ResizablePanel>
        </ResizablePanelGroup>
      </Swatch>

      <Swatch label="Select" installName="select">
        <Select defaultValue="a">
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
            <SelectItem value="b">Option B</SelectItem>
          </SelectContent>
        </Select>
      </Swatch>

      <Swatch label="Spinner" installName="spinner">
        <Spinner className="size-5 text-primary" />
      </Swatch>

      <Swatch label="Switch" installName="switch">
        <div className="flex items-center gap-2">
          <Switch id="prim-sw" defaultChecked />
          <label htmlFor="prim-sw" className="text-xs">Airplane mode</label>
        </div>
      </Swatch>

      <Swatch label="Tabs" installName="tabs">
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
          <TabsContent value="a" className="text-xs text-muted-foreground">Tab A content</TabsContent>
          <TabsContent value="b" className="text-xs text-muted-foreground">Tab B content</TabsContent>
        </Tabs>
      </Swatch>

      <Swatch label="Toggle Group" installName="toggle-group">
        <ToggleGroup defaultValue={["b"]} variant="outline">
          <ToggleGroupItem value="a">A</ToggleGroupItem>
          <ToggleGroupItem value="b">B</ToggleGroupItem>
          <ToggleGroupItem value="c">C</ToggleGroupItem>
        </ToggleGroup>
      </Swatch>

      <Swatch label="Breadcrumb-style nav">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>Home</span>
          <ChevronRightIcon className="size-3" />
          <span>Docs</span>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground">Primitives</span>
        </div>
      </Swatch>
    </div>
  )
}
