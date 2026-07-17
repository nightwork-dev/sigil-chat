const PALETTE = [
  { name: "amber", bg: "bg-amber-500/20", text: "text-amber-400", hex: "#f59e0b", bgAlpha: "rgba(245, 158, 11, 0.6)" },
  { name: "blue", bg: "bg-blue-500/20", text: "text-blue-400", hex: "#3b82f6", bgAlpha: "rgba(59, 130, 246, 0.6)" },
  { name: "emerald", bg: "bg-emerald-500/20", text: "text-emerald-400", hex: "#10b981", bgAlpha: "rgba(16, 185, 129, 0.6)" },
  { name: "purple", bg: "bg-purple-500/20", text: "text-purple-400", hex: "#a855f7", bgAlpha: "rgba(168, 85, 247, 0.6)" },
  { name: "rose", bg: "bg-rose-500/20", text: "text-rose-400", hex: "#f43f5e", bgAlpha: "rgba(244, 63, 94, 0.6)" },
  { name: "cyan", bg: "bg-cyan-500/20", text: "text-cyan-400", hex: "#06b6d4", bgAlpha: "rgba(6, 182, 212, 0.6)" },
  { name: "orange", bg: "bg-orange-500/20", text: "text-orange-400", hex: "#f97316", bgAlpha: "rgba(249, 115, 22, 0.6)" },
  { name: "teal", bg: "bg-teal-500/20", text: "text-teal-400", hex: "#14b8a6", bgAlpha: "rgba(20, 184, 166, 0.6)" },
] as const;

export type PaletteColor = (typeof PALETTE)[number];

export function getColor(index: number): PaletteColor {
  return PALETTE[index % PALETTE.length];
}

export function getColorById(id: string, allIds: string[]): PaletteColor {
  return getColor([...allIds].sort().indexOf(id));
}

export { PALETTE };
