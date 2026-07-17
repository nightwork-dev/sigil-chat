// Minimal argv parser for the Sigil CLI.
// Handles --flag, --flag=value, --flag value, --no-flag, -f, and positionals.
// No framework dep — this covers every flag shape the spec needs.
// Extend, don't replace, when new shapes appear.

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean | string[]>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: ParsedArgs["flags"] = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq !== -1) {
        const key = arg.slice(2, eq);
        const value = arg.slice(eq + 1);
        appendFlag(flags, toCamel(key), value);
      } else {
        const key = arg.slice(2);
        if (key.startsWith("no-")) {
          flags[toCamel(key.slice(3))] = false;
        } else if (i + 1 < argv.length && !argv[i + 1].startsWith("-")) {
          appendFlag(flags, toCamel(key), argv[++i]);
        } else {
          flags[toCamel(key)] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      flags[arg.slice(1)] = true;
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

function appendFlag(
  flags: ParsedArgs["flags"],
  key: string,
  value: string,
): void {
  const previous = flags[key];
  if (typeof previous === "string") {
    flags[key] = [previous, value];
  } else if (Array.isArray(previous)) {
    previous.push(value);
  } else {
    flags[key] = value;
  }
}

function toCamel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function getString(
  flags: ParsedArgs["flags"],
  key: string,
): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

export function getBool(
  flags: ParsedArgs["flags"],
  key: string,
  fallback = false,
): boolean {
  const v = flags[key];
  if (v === true) return true;
  if (v === false) return false;
  return fallback;
}

export function getStrings(flags: ParsedArgs["flags"], key: string): string[] {
  const value = flags[key];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value : [];
}
