const SAFE_PATH = /^[A-Za-z0-9_@+./-]{1,240}$/;
const ALLOWED_EXTENSIONS = /\.(?:ts|tsx|js|mjs|cjs|css|md|json)$/;
const BLOCKED_PATHS = [
  /^\.github\//, /^supabase\//, /^\.env/, /^package(?:-lock)?\.json$/, /^vercel\.json$/,
  /^app\/api\/(?:account|auth|checkout|stripe|company\/engineering)\//,
  /^app\/api\/company\/actions\/callback\//,
  /^lib\/(?:server-auth|stripe|entitlement)/,
  /^lib\/company-os\/(?:engineering-|executor|policy|execution-policy)/,
  /^scripts\/deepseek-engineering-worker\.mjs$/,
];

export function safeEngineeringPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!SAFE_PATH.test(path) || !ALLOWED_EXTENSIONS.test(path) || path.startsWith("/") || path.includes("..") || BLOCKED_PATHS.some((pattern) => pattern.test(path))) return null;
  return path;
}

function firstJson(text: string): Record<string, unknown> | null {
  try {
    const source = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const start = source.indexOf("{");
    const end = source.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(source.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function parseEngineeringSelection(text: string, inventory: Set<string>): string[] | null {
  const parsed = firstJson(text);
  if (!parsed || !Array.isArray(parsed.files)) return null;
  const files = [...new Set(parsed.files.map(safeEngineeringPath).filter((path): path is string => path !== null && inventory.has(path)))].slice(0, 6);
  return files.length ? files : null;
}

export function explicitlyNamedEngineeringPaths(job: unknown, inventory: Set<string>): string[] {
  let source = "";
  try { source = JSON.stringify(job); } catch { return []; }
  return [...inventory]
    .filter((path) => safeEngineeringPath(path) === path && source.includes(path))
    .slice(0, 6);
}

export type EngineeringEdit = { path: string; find: string; replace: string };

export function parseEngineeringEdits(text: string, currentFiles: Map<string, string>): { edits: EngineeringEdit[]; summary: string } | null {
  const parsed = firstJson(text);
  const summary = typeof parsed?.summary === "string" ? parsed.summary.trim().replace(/\s+/g, " ").slice(0, 500) : "";
  if (!summary || !Array.isArray(parsed?.edits) || parsed.edits.length < 1 || parsed.edits.length > 12) return null;
  const working = new Map(currentFiles);
  const edits: EngineeringEdit[] = [];
  let editBytes = 0;
  for (const item of parsed.edits) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const path = safeEngineeringPath(row.path);
    const find = typeof row.find === "string" ? row.find : "";
    const replace = typeof row.replace === "string" ? row.replace : "";
    const content = path ? working.get(path) : undefined;
    if (!path || content === undefined || !find || find === replace || find.length > 20_000 || replace.length > 30_000 || find.includes("\0") || replace.includes("\0")) return null;
    const first = content.indexOf(find);
    if (first < 0 || content.lastIndexOf(find) !== first) return null;
    editBytes += find.length + replace.length;
    if (editBytes > 80_000) return null;
    working.set(path, `${content.slice(0, first)}${replace}${content.slice(first + find.length)}`);
    edits.push({ path, find, replace });
  }
  return edits.length ? { edits, summary } : null;
}

export function parseEngineeringPatch(text: string, allowedFiles: Set<string>): { patch: string; summary: string } | null {
  const parsed = firstJson(text);
  const patch = typeof parsed?.patch === "string" ? parsed.patch.trim() : "";
  const summary = typeof parsed?.summary === "string" ? parsed.summary.trim().replace(/\s+/g, " ").slice(0, 500) : "";
  if (!patch || patch.length > 120_000 || !summary || /(?:^|\n)(?:new file mode|deleted file mode)/.test(patch)) return null;
  const pairs = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm)];
  if (!pairs.length) return null;
  if (pairs.some((match) => match[1] !== match[2])) return null;
  const headerPaths = [...patch.matchAll(/^(?:--- a\/|\+\+\+ b\/)(.+)$/gm)].map((match) => match[1]);
  if (headerPaths.length !== pairs.length * 2) return null;
  const paths = [...pairs.flatMap((match) => [safeEngineeringPath(match[1]), safeEngineeringPath(match[2])]), ...headerPaths.map(safeEngineeringPath)];
  if (paths.some((path) => !path || !allowedFiles.has(path))) return null;
  return { patch, summary };
}
