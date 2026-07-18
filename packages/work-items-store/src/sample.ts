import type { Story, WorkItemsDocument, ReviewItem } from "./types.js";

const SEED_TIMESTAMP = "2026-07-18T00:00:00.000Z";

const seedStories: Story[] = [
  // ---------------------------------------------------------------------
  // Experience stories — user & agent cognition
  // ---------------------------------------------------------------------
  {
    id: "EXP.1",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "My agent comes with me",
    intent:
      "Switching between workspaces/demos keeps the same agent personality and session — same agent, same memory, same thread. Implements via agent identity + session mobility (Track 8, Track 3).",
    acceptanceCriteria: [
      "Switching workspaces (chat, reducer-graph studio, review) keeps the same agent identity, memory, and thread rather than starting a fresh one.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S8.2", "S3.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.2",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I can bring someone in",
    intent:
      "Invite another user into a session so both work with the same agent(s) and shared workspace. Implements via S3.4 session membership.",
    acceptanceCriteria: [
      "A second user can be invited into an existing session and see the same agent(s) and shared workspace state.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S3.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.3",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I stay in control",
    intent:
      "Review and approve what the agent proposes — new skills, roadmap changes, edits — before they take effect. Implements via S1.3 review queue, S2.2 skill approval.",
    acceptanceCriteria: [
      "Agent-proposed roadmap changes and new skills surface in a review queue and only take effect after explicit approval.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S1.3", "S2.2"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.4",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I manage what my agent is made of",
    intent:
      "View/edit the agent's skills, see its memory, and set which tools it may use. Implements via Track 2 (agent operations surfaces).",
    acceptanceCriteria: [
      "A single surface lets the user view/edit agent skills, inspect memory, and set per-tool approval defaults.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S2.1", "S2.2", "S2.3"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.5",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "My documents stay with the work",
    intent:
      "Attach files to a session and have the agent refer back to them later, even after reload. Implements via Track 6 (session artifacts).",
    acceptanceCriteria: [
      "A file attached to a session remains available and agent-readable after a page reload, without re-uploading.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S6.1", "S6.2", "S6.3", "S6.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.6",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "My own skills (agent)",
    intent:
      "As an agent, create and use skills unique to me — my personal toolkit, not shared unless I share them. Implements via persona-scoped skills (S2.2 + S6.5 persona).",
    acceptanceCriteria: [
      "A skill authored in persona scope is usable by that agent identity and not visible to other agents by default.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S2.2", "S6.5"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.7",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "Skills for this workspace (agent)",
    intent:
      "As an agent, create a skill for the current workspace (e.g. the reducer-graph demo) that other agents in that workspace can use. Implements via project/workspace-scoped skills (S2.2 + S6.5 project).",
    acceptanceCriteria: [
      "A skill authored in project/workspace scope is usable by any agent participating in that same workspace.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S2.2", "S6.5"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.8",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "Skills for everyone (agent)",
    intent:
      "As an agent, create and suggest a global skill any agent could use, pending a human's approval. Implements via global skills + suggest/approve (S2.2 + review).",
    acceptanceCriteria: [
      "A suggested global skill appears in the review queue and only becomes globally available after human approval.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S2.2", "S1.3"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.9",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I remember (agent)",
    intent:
      "As an agent, remember across turns and sessions and recall what's relevant — my own memory, plus what a workspace/project should know. Implements via S3.1 (persona + project scope).",
    acceptanceCriteria: [
      "A fact stated in one session is recalled by the agent in a later session without the user restating it.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S3.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.10",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "A shared scratch space (agent)",
    intent:
      "As an agent, have a persistent blackboard shared with the user and other agents in the session to think out loud and hand off work. Implements via S3.2.",
    acceptanceCriteria: [
      "Content written to the blackboard by one participant (user or agent) is visible to other participants in the same session.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S3.2"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.11",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I can run code (agent)",
    intent:
      "As an agent, write and run scripts in a persistent sandbox — pull data, transform it, save intermediate files — and pick up where I left off. Implements via S3.3 (eve sandbox).",
    acceptanceCriteria: [
      "A script run in the sandbox can write a file that is still present and readable in a later turn of the same session.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S3.3"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.12",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I improve myself (agent)",
    intent:
      "As an agent, draft a new skill, test it in my sandbox, and keep it if it works — refining my own toolkit over time. Implements via S3.3 + S2.2 self-improvement.",
    acceptanceCriteria: [
      "An agent-authored skill is tested in the sandbox before being persisted to the agent's own skill set.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S3.3", "S2.2"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "EXP.13",
    epicId: "experience",
    epicTitle: "Experience — user & agent cognition",
    title: "I keep who I am as I move (agent)",
    intent:
      "As an agent, keep my personality and memory persistent across the workspaces and sessions I join, and collaborate with other agents in a shared session without losing my identity. Implements via Track 8 + S3.4 multi-agent.",
    acceptanceCriteria: [
      "An agent identity retains its personality and memory when joining a new workspace/session and when sharing a session with other agents.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: ["S8.2", "S8.3", "S3.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 0 — Attachments & Ingress
  // ---------------------------------------------------------------------
  {
    id: "S0.1",
    epicId: "track-0",
    epicTitle: "Attachments & Ingress",
    title: "Vision + text-document delivery",
    intent:
      "Deliver image attachments to the model as data URLs and text attachments as decoded text so the agent can use both.",
    acceptanceCriteria: [
      "Images reach the model inline as data URLs for vision, and text files reach it as decoded text parts.",
      "Delivery is verified; text-file inline UX is superseded by Track 6 while images remain inline.",
    ],
    status: "shipped",
    routing: "pi:luna",
    reviewGate: "none",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S0.2",
    epicId: "track-0",
    epicTitle: "Attachments & Ingress",
    title: "Ingress Cores showcase",
    intent:
      "Showcase Sheets round-trip and .env paste-to-populate behavior by composing the existing clipboard, delimited, and dotenv primitives.",
    acceptanceCriteria: [
      "TypeScript typechecks with 0 errors and the Vite build passes.",
      "The two exhibits render and round-trip correctly in the browser.",
    ],
    status: "shipped",
    routing: "claude:sonnet",
    reviewGate: "browser:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S0.3",
    epicId: "track-0",
    epicTitle: "Attachments & Ingress",
    title: "Land the milestone as commits",
    intent:
      "Land the attachment milestone in concern-grouped commits without pushing, while leaving graduated main and unrelated work in place.",
    acceptanceCriteria: [
      "Create separate concern-grouped commits with trailers, leave graduated main and unrelated WIP untouched, and report the hashes.",
    ],
    status: "ready",
    routing: "self",
    reviewGate: "peer",
    deps: ["S0.1", "S0.2"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S0.4",
    epicId: "track-0",
    epicTitle: "Attachments & Ingress",
    title: "Durable attachment reload",
    intent:
      "Folded into Track 6: thumbnails vanish on refresh because eve doesn't persist inline attachments; the fix is the same session-artifact store as the de-spam work (S6.1-S6.4).",
    acceptanceCriteria: [
      "Specify a display-versus-model split that preserves attachment thumbnails across refresh without sending text files inline or relying on blocked local URLs.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "none",
    deps: ["S0.1", "S6.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 6 — Session artifacts / file management
  // ---------------------------------------------------------------------
  {
    id: "S6.0",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "Model-vs-display contract",
    intent:
      "Decided: the model receives the reference AND the full text automatically (no tool round-trip for normal files); the spam is a UI problem, so the fix is a display-vs-model split — full text to the model, a compact file chip in the transcript. Huge-file summarization via RLM/subagents is a later feature.",
    acceptanceCriteria: [
      "The model-vs-display contract is recorded: full text still reaches the model automatically; the transcript renders a file chip instead of the attachment's text part inline.",
    ],
    status: "shipped",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    decidedBy: "David",
    decidedAt: SEED_TIMESTAMP,
  },
  {
    id: "S6.1",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "Artifact store + session scoping",
    intent:
      "Extend the existing gonk artifact store to hold arbitrary file bytes (md/csv/txt/…, not just images) keyed by the eve session id, durable across reload.",
    acceptanceCriteria: [
      "Uploading a file persists it in the gonk artifact store and it remains retrievable by id after a server restart.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S6.0"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S6.2",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "Display-vs-model split (agent-eve 0.1.6 + transcript rendering)",
    intent:
      "The model still gets the full text plus a durable artifact reference; the transcript stops rendering the attachment's text part inline and shows a file chip instead. Images stay inline for vision.",
    acceptanceCriteria: [
      "Attaching an .md file lets the model still quote it, but the message bubble shows a file chip rather than a fenced text dump.",
    ],
    status: "ready",
    routing: "self",
    reviewGate: "browser:David",
    deps: ["S6.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S6.3",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "sigil-file-* gonk tools",
    intent:
      "Add sigil-list-session-files and sigil-read-file(id) gonk tools so the agent fetches attachment content on demand instead of relying only on inline delivery.",
    acceptanceCriteria: [
      "An agent asked to summarize an attached file calls sigil-read-file and answers from the real fetched content.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S6.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S6.4",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "File-chip UI + durable reload",
    intent:
      "Attachments render as file chips in the user's message and survive a page refresh because they are artifact-backed rather than inline-only.",
    acceptanceCriteria: [
      "Reloading the page preserves the file chips and the agent's ability to re-read the underlying files.",
    ],
    status: "ready",
    routing: "claude:sonnet",
    reviewGate: "browser:David",
    deps: ["S6.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S6.5",
    epicId: "track-6",
    epicTitle: "Session artifacts / file management",
    title: "Tiered resource scope (session / project|workspace / agent|persona)",
    intent:
      "Generalize S6.1's session-hardcoded artifact key into a tier + id (session / project-workspace / agent-persona), reusing @gonk/scope's tiers. Cross-cutting: also the scoping model for memory (S3.1), blackboard (S3.2), and skills (S2.2). Scope tier is where a resource lives, not authorization — a separate membership check authorizes access.",
    acceptanceCriteria: [
      "The artifact manifest key generalizes from a bare session id to <tier>/<id>/…, with session remaining the default tier and no regression to existing session-scoped behavior.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S6.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 1 — Roadmap & review surface
  // ---------------------------------------------------------------------
  {
    id: "S1.0",
    epicId: "track-1",
    epicTitle: "Roadmap & review surface",
    title: "Shape decision",
    intent:
      "Choose a dedicated Roadmap workspace with live agent-editable stories and a David review queue rather than a lighter read-only render.",
    acceptanceCriteria: [
      "David decides between the dedicated Roadmap workspace and the lighter read-only render, recording the choice before Track 1 implementation proceeds.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.1",
    epicId: "track-1",
    epicTitle: "Roadmap & review surface",
    title: "work-items-store package + story schema",
    intent:
      "Provide a durable work-items store for the roadmap stories, review assignments, comments, and append-only revisions.",
    acceptanceCriteria: [
      "The @workspace/work-items-store package mirrors review-store, defines the Story schema, persists append-only revisions, and seeds this story list.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S1.0"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.2",
    epicId: "track-1",
    epicTitle: "Roadmap & review surface",
    title: "sigil-story-* Gonk tools",
    intent:
      "Expose story upsert, transition, and review-assignment mutations through Gonk so chat actions update the roadmap board.",
    acceptanceCriteria: [
      "tools/list shows the three sigil-story tools, driving one in chat mutates the board, each returns a clientCommand, and the exec tier remains denied by policy.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S1.0", "S1.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.3",
    epicId: "track-1",
    epicTitle: "Roadmap & review surface",
    title: "Roadmap workspace UI",
    intent:
      "Render the seeded stories as a status board with story editing and a David review queue that feeds decisions back through the domain-outcome loop.",
    acceptanceCriteria: [
      "The workspace renders the seeded stories, approving a review item transitions it, the route header comment is present, typecheck and build pass, and the browser console is clean.",
    ],
    status: "ready",
    routing: "claude:opus",
    reviewGate: "browser:David",
    deps: ["S1.0", "S1.1"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S1.4",
    epicId: "track-1",
    epicTitle: "Roadmap & review surface",
    title: "Agent authoring loop",
    intent:
      "Make story proposals, updates, and David review assignments a normal part of the agent's working loop.",
    acceptanceCriteria: [
      "Agent instructions and a skill cause the agent to propose or update stories and assign David reviews as a normal part of work, closing the in-tool review loop.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "browser:David",
    deps: ["S1.2", "S1.3"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 2 — Agent operations surfaces
  // ---------------------------------------------------------------------
  {
    id: "S2.0",
    epicId: "track-2",
    epicTitle: "Agent operations surfaces",
    title: "Resource-manager shell",
    intent:
      "Ship the shared list-plus-detail resource-manager shell (compound Root/Parts) that S2.1-S2.3 reuse. No deps; unblocks the three surfaces below.",
    acceptanceCriteria: [
      "A shared list+detail resource-manager shell exists as a compound Root/Parts component consumed by at least one of S2.1-S2.3.",
    ],
    status: "ready",
    routing: "claude:sonnet",
    reviewGate: "browser:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S2.1",
    epicId: "track-2",
    epicTitle: "Agent operations surfaces",
    title: "View agents (read-only)",
    intent:
      "Decision: a read-only viewer over Eve's loaded agent info. defineAgent/subagents are git-authored TS with no write API; authoring TS files is a separate future feature, not this.",
    acceptanceCriteria: [
      "The agents surface lists Eve's loaded defineAgent configuration (model, instructions, connections, subagents) as read-only over the shared shell.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S2.0"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S2.2",
    epicId: "track-2",
    epicTitle: "Agent operations surfaces",
    title: "Manage skills (CRUD)",
    intent:
      "Build one surface (view + author) over @gonk/skills 0.3.1's FilesystemManagedSkillRegistry CRUD, wired into the gonk MCP registry so apps/gonk and apps/agent don't race the skills dir. Absorbs S7.5.",
    acceptanceCriteria: [
      "The skills surface lists, creates, edits, and deletes skills through the gonk MCP registry's locking, with no direct filesystem race between apps/gonk and apps/agent.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: ["S2.0"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S2.3",
    epicId: "track-2",
    epicTitle: "Agent operations surfaces",
    title: "Tool permissions & catalog",
    intent:
      "Per-tool approval defaults are real plumbing (SDK ApprovalContext.toolName is already per-call): header -> channels/eve.ts -> connections/gonk.ts. Never touches the server exec-tier hard-deny.",
    acceptanceCriteria: [
      "The tool-permissions surface lists tools and sets per-tool approval defaults that flow through channels/eve.ts and connections/gonk.ts without weakening the exec-tier hard-deny.",
    ],
    status: "ready",
    routing: "claude:sonnet",
    reviewGate: "peer",
    deps: ["S2.0"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 3 — Agent memory & workspace
  // ---------------------------------------------------------------------
  {
    id: "S3.1",
    epicId: "track-3",
    epicTitle: "Agent memory & workspace",
    title: "Memory",
    intent:
      "Substrate is @mirk/store (BM25 lexical) in gonk; embeddings deferred (no embedder wired). Activate the already-written-but-dead @gonk/retrieval contributor via a half-day spike (default), falling back to a bespoke ~40-line contributor if it fights us.",
    acceptanceCriteria: [
      "A fact stated in one turn is recalled via @gonk/retrieval (or the bespoke fallback contributor) in a later turn, verified as a behavioral A/B rather than 'the store persists'.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S3.2",
    epicId: "track-3",
    epicTitle: "Agent memory & workspace",
    title: "Persistent blackboard",
    intent:
      "Substrate is file-store-core (mirror review-store): one small shared doc both parties edit, rides every turn. No David call. Converges with Track 6; best first Track-3 build.",
    acceptanceCriteria: [
      "A blackboard edit from the user or the agent is visible to the other party on the very next turn of the same session.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S3.3",
    epicId: "track-3",
    epicTitle: "Agent memory & workspace",
    title: "Agent REPL (persistent)",
    intent:
      "Trust-model resolved (David: no problem with exec in sandbox). Build on eve's per-session microsandbox: /workspace durable, interpreter heap not. Ship with hardening — pinned Microsandbox module, network deny-all/narrow allow-list, explicit exec approval for bash/write_file, seed only the active workspace channel. Gonk exec stays denied; delegate into the sandbox instead.",
    acceptanceCriteria: [
      "A script run in the eve sandbox can write and later re-read a file under /workspace across turns of the same session.",
      "Network access from the sandbox is deny-all or narrow-allow-listed, and unrestricted bash/write_file calls require explicit approval.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "browser:David",
    deps: ["S3.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S3.4",
    epicId: "track-3",
    epicTitle: "Agent memory & workspace",
    title: "Sandbox provider: local → cloud, session-scoped (shareable)",
    intent:
      "Make eve's sandbox a pluggable provider (microsandbox local / cloud microVM-container prod). Isolation boundary is the SESSION, not the user — sessions are shareable (multi-user + multi-agent). Sandbox/workspace/blackboard/artifacts are session-scoped shared resources; access is session membership, authorized explicitly. v1 membership is owner-only but scoped to the session from the start.",
    acceptanceCriteria: [
      "Specify the pluggable sandbox-provider interface (local microsandbox vs. cloud) and the session-membership model it authorizes against, aligned to AUTH-AND-USER-SETTINGS-SPEC.md.",
      "Verify subagent sandbox sharing within a session versus isolation across sessions.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 5 — Hygiene
  // ---------------------------------------------------------------------
  {
    id: "S5.1",
    epicId: "track-5",
    epicTitle: "Hygiene",
    title: "Emphasis extraction",
    intent:
      "Extract imperative emphasis into a reusable headless UI primitive and rewire the agent highlight path to consume it so the capability does not orphan.",
    acceptanceCriteria: [
      "Extract agent-dom-effects into @workspace/ui imperative-emphasis, rewire the sigil-chat agent path, and verify the live agent-highlight path in the browser.",
    ],
    status: "ready",
    routing: "claude:sonnet",
    reviewGate: "browser:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S5.2",
    epicId: "track-5",
    epicTitle: "Hygiene",
    title: "Fix stale @niwork docs",
    intent:
      "Correct the stale Sigil Chat documentation so it names the current @zigil packages and the graduated development history.",
    acceptanceCriteria: [
      "Update sigil-chat-dev/CLAUDE.md to replace stale @niwork/agent* names and correct the graduated @niwork paragraph without changing unrelated guidance.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 7 — Gonk integration hygiene
  // ---------------------------------------------------------------------
  {
    id: "S7.0",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Work-items substrate reconciliation",
    intent:
      "Resolved 2026-07-18: keep the local work-items-store; add a documented GonkWorkItemsRepository adapter seam. @gonk/work-items models supervised agent jobs, not roadmap stories (~2 of ~17 Story fields map); the genuine overlap is the review/attention queue, reconciled at the WorkItemsRepository interface seam. Track 1 unblocked.",
    acceptanceCriteria: [
      "Document the GonkWorkItemsRepository adapter seam and reserve the adapter name, without re-backing the Story record onto @gonk/work-items.",
    ],
    status: "shipped",
    routing: "self",
    reviewGate: "none",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
    decidedBy: "David",
    decidedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.1",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Retrieval: wire or drop",
    intent:
      "@gonk/retrieval is imported in sigil-context.ts but the default compiler never registers it and there's no live source — dead in prod. Wire one real source end-to-end or drop the import.",
    acceptanceCriteria: [
      "Either a real retrieval source is registered and demonstrably used by the compiler, or the dead @gonk/retrieval import is removed from sigil-context.ts.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.2",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Tool-orchestrator: productionize or remove",
    intent:
      "Only a test import exists; registry.ts calls createSigilRegistry() directly. The tool-orchestrator path is orphaned.",
    acceptanceCriteria: [
      "Either the tool-orchestrator is wired into registry.ts's real path, or the orphaned import and its test-only usage are removed.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.3",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Auth: real principal separation",
    intent:
      "Production collapses to one global service principal; the grant seams exist but per-user/workspace authz at the tool boundary doesn't.",
    acceptanceCriteria: [
      "Specify how per-user/workspace principals are separated at the tool boundary, distinct from the single global service principal used today.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.4",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Context receipts",
    intent:
      "@gonk/context runs every turn but compiler receipts aren't persisted or surfaced; auditability is missing.",
    acceptanceCriteria: [
      "Specify how per-turn context-compiler receipts are persisted and surfaced for audit before dispatch.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "none",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.5",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Skills lifecycle UI",
    intent:
      "/skills is a read-only catalog with a stale 'unavailable' message though @gonk/skills 0.3.1 ships the lifecycle. Overlaps Track 2 S2.2 — build them together.",
    acceptanceCriteria: [
      "The /skills surface reflects the real @gonk/skills lifecycle instead of a stale 'unavailable' message, built together with S2.2.",
    ],
    status: "ready",
    routing: "claude:sonnet",
    reviewGate: "peer",
    deps: ["S2.2"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.6",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Graduate image-gen",
    intent:
      "registry/codex-image.ts is a local fork that names its own debt in comments; publish and consume @gonk/image-gen instead.",
    acceptanceCriteria: [
      "registry/codex-image.ts is replaced by a consumed @gonk/image-gen dependency, with the local fork removed.",
    ],
    status: "ready",
    routing: "pi:luna",
    reviewGate: "peer",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S7.7",
    epicId: "track-7",
    epicTitle: "Gonk integration hygiene",
    title: "Capability channels",
    intent:
      "Every tool is visibility:\"always\"; the @gonk/channel proposal is the real fix for the prompt-budget problem. Proposal-only today; schedule, don't build blind.",
    acceptanceCriteria: [
      "Record the @gonk/channel proposal and a scheduling decision for when tool visibility gets tiered, without building it blind.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },

  // ---------------------------------------------------------------------
  // Track 8 — Agent identity / personality
  // ---------------------------------------------------------------------
  {
    id: "S8.1",
    epicId: "track-8",
    epicTitle: "Agent identity / personality",
    title: "Persona model",
    intent:
      "What an agent identity IS: the authored base (defineAgent: personality/instructions) plus the accreted persona (durable persona-scoped memory [S3.1], persona skills [S2.2], a stable id). Design first; align with David's existing persona/self-model infra rather than reinventing it. Blocked on David's shape decision.",
    acceptanceCriteria: [
      "David decides the persona model shape (authored base + accreted memory/skills/id) before S8.2/S8.3 are dispatched.",
    ],
    status: "blocked",
    routing: "self",
    reviewGate: "decision:David",
    deps: [],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S8.2",
    epicId: "track-8",
    epicTitle: "Agent identity / personality",
    title: "Identity travels",
    intent:
      "\"My agent comes with me\": switching workspace/demo keeps the same identity, thread, and memory. Needs the session model (S3.4) and persona scope (S6.5).",
    acceptanceCriteria: [
      "Specify how switching workspace/demo preserves the same agent identity, thread, and memory, built on S3.4's session model and S6.5's persona scope.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "none",
    deps: ["S8.1", "S3.4", "S6.5"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
  {
    id: "S8.3",
    epicId: "track-8",
    epicTitle: "Agent identity / personality",
    title: "Multi-agent in a session",
    intent:
      "Several agents share one session, each keeping its own identity/persona while sharing the session workspace/blackboard. Needs S3.4 membership (agents as participants).",
    acceptanceCriteria: [
      "Specify how multiple agents in one session each retain a distinct identity/persona while sharing the session's workspace and blackboard.",
    ],
    status: "spec",
    routing: "self",
    reviewGate: "none",
    deps: ["S8.1", "S3.4"],
    authoredBy: "David",
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP,
  },
];

const seedReviews: ReviewItem[] = [
  {
    id: "review-S0.2-browser",
    storyId: "S0.2",
    assignee: "David",
    gate: "browser:David",
    title: "Confirm Ingress Cores showcase renders and round-trips",
    summary:
      "S0.2 is shipped (typecheck + build pass). Needs a browser eyeball on the two /showcase/hooks exhibits (Sheets round-trip grid, .env paste-to-populate) before this closes out.",
    unread: true,
    completed: false,
    createdAt: SEED_TIMESTAMP,
  },
  {
    id: "review-S6.0-decision",
    storyId: "S6.0",
    assignee: "David",
    gate: "decision:David",
    title: "Record the model-vs-display contract decision",
    summary:
      "S6.0's display-vs-model split (full text to the model, file chip in the transcript) is the contract S6.2 builds against. Confirm the decision is captured correctly before S6.2 lands.",
    unread: true,
    completed: false,
    createdAt: SEED_TIMESTAMP,
  },
];

export function createWorkItemsDocument(): WorkItemsDocument {
  return {
    revision: 0,
    stories: structuredClone(seedStories),
    comments: [],
    reviews: structuredClone(seedReviews),
    history: [],
  };
}
