import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface SetupOptions {
  apply?: boolean;
  /** Base home directory. Tests pass a temp dir so real configs are never touched. */
  home?: string;
}

export interface SetupAction {
  target: "claude-code" | "codex" | "cursor";
  status: "would-add" | "added" | "unchanged" | "error";
  detail: string;
  file?: string;
}

export interface SetupResult {
  apply: boolean;
  home: string;
  actions: SetupAction[];
}

const SERVER_NAME = "browser-port";
const COMMAND = "npx";
const ARGS = ["-y", "browser-port", "mcp"];

/**
 * Register the MCP server with Claude Code, Codex, and Cursor. Dry-run by
 * default; pass apply to write. Existing files are backed up to <file>.bak and
 * the operation is idempotent: running twice makes no second change.
 */
export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  const apply = Boolean(options.apply);
  const home = options.home ?? homedir();
  const actions: SetupAction[] = [];

  actions.push(await setupJson("claude-code", path.join(home, ".claude.json"), apply));
  actions.push(await setupCodex(path.join(home, ".codex", "config.toml"), apply));
  actions.push(await setupJson("cursor", path.join(home, ".cursor", "mcp.json"), apply));

  return { apply, home, actions };
}

async function backupAndWrite(file: string, content: string, apply: boolean): Promise<void> {
  if (!apply) return;
  await mkdir(path.dirname(file), { recursive: true });
  if (existsSync(file)) await copyFile(file, `${file}.bak`);
  await writeFile(file, content);
}

/** Claude Code (~/.claude.json) and Cursor (~/.cursor/mcp.json) share a JSON shape. */
async function setupJson(
  target: "claude-code" | "cursor",
  file: string,
  apply: boolean,
): Promise<SetupAction> {
  try {
    let config: Record<string, unknown> = {};
    if (existsSync(file)) {
      const raw = await readFile(file, "utf8");
      config = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    }
    const servers = (config.mcpServers as Record<string, unknown> | undefined) ?? {};
    const desired = { command: COMMAND, args: ARGS };
    const current = servers[SERVER_NAME];
    if (current && JSON.stringify(current) === JSON.stringify(desired)) {
      return { target, status: "unchanged", detail: `${SERVER_NAME} already registered`, file };
    }
    servers[SERVER_NAME] = desired;
    config.mcpServers = servers;
    const content = JSON.stringify(config, null, 2) + "\n";
    await backupAndWrite(file, content, apply);
    return {
      target,
      status: apply ? "added" : "would-add",
      detail: `${SERVER_NAME} -> ${COMMAND} ${ARGS.join(" ")}`,
      file,
    };
  } catch (err) {
    return { target, status: "error", detail: String(err instanceof Error ? err.message : err), file };
  }
}

/** Codex uses TOML; we replace or append the [mcp_servers.browser-port] table. */
async function setupCodex(file: string, apply: boolean): Promise<SetupAction> {
  try {
    const header = `[mcp_servers.${SERVER_NAME}]`;
    const block = [
      header,
      `command = "${COMMAND}"`,
      `args = [${ARGS.map((a) => `"${a}"`).join(", ")}]`,
    ].join("\n");

    let existing = "";
    if (existsSync(file)) existing = await readFile(file, "utf8");

    if (existing.includes(header)) {
      const replaced = replaceTomlTable(existing, header, block);
      if (replaced.trim() === existing.trim()) {
        return { target: "codex", status: "unchanged", detail: `${SERVER_NAME} already registered`, file };
      }
      await backupAndWrite(file, replaced, apply);
      return { target: "codex", status: apply ? "added" : "would-add", detail: `updated ${header}`, file };
    }

    const sep = existing.trim() ? "\n\n" : "";
    const content = existing.trimEnd() + sep + block + "\n";
    await backupAndWrite(file, content, apply);
    return {
      target: "codex",
      status: apply ? "added" : "would-add",
      detail: `${SERVER_NAME} -> ${COMMAND} ${ARGS.join(" ")}`,
      file,
    };
  } catch (err) {
    return { target: "codex", status: "error", detail: String(err instanceof Error ? err.message : err), file };
  }
}

/** Replace a TOML table (from its header to the next header or EOF). */
export function replaceTomlTable(source: string, header: string, block: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === header);
  if (start === -1) return source;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end]!)) end++;
  const before = lines.slice(0, start);
  const after = lines.slice(end);
  const merged = [...before, ...block.split("\n"), ...(after.length && after[0] !== "" ? [""] : []), ...after];
  return merged.join("\n").replace(/\n{3,}/g, "\n\n");
}
