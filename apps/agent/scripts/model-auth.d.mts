export function hasCodexAccessToken(raw: string): boolean
export function hasCodexModelAuth(options?: {
  codexHome?: string
  read?: (path: string, encoding: "utf8") => Promise<string>
}): Promise<boolean>
