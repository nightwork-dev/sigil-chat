// defineReport — typed metadata helper for report files.
// Reports export a default React component (the content) and an optional
// named `report` export (the metadata). This helper provides typing for the
// metadata. See docs/specs/template-cli-and-static-report-proposal.md §7.2.

export interface ReportPreview {
  image?: string;
  alt?: string;
}

export interface ReportNavEntry {
  id: string;
  title: string;
  summary?: string;
}

/** Report-local reference material. It is never authoritative runtime instruction. */
export interface ReportSkill {
  name: string;
  version?: string;
  description: string;
  content: string;
  scope: "report-reader" | (string & {});
  trust: "advisory";
}

export interface ReportAgentMeta {
  summary?: string;
  nav?: ReportNavEntry[];
  skills?: ReportSkill[];
}

export interface ReportMetadata {
  title: string;
  summary?: string;
  author?: string;
  tags?: string[];
  preview?: ReportPreview;
  agent?: ReportAgentMeta;
}

/**
 * Declare report metadata with full typing. Returns the metadata as-is —
 * the value is in the types, not runtime behavior.
 *
 * @example
 * export const report = defineReport({
 *   title: "Weekly Agent Run Review",
 *   summary: "Throughput, failures, and next actions.",
 * })
 *
 * export default function WeeklyReport() { return <main>...</main> }
 */
export function defineReport(meta: ReportMetadata): ReportMetadata {
  return meta;
}
