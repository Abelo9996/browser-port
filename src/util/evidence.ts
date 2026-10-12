import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CommandResult } from "./exec.js";
import { formatCommand } from "./exec.js";
import type { RecordedCommand } from "../types.js";

/**
 * A work directory holds everything about one port: the cloned or copied
 * source, the build output, screenshots, and a running record of every command
 * executed. The record is what makes "every answer comes with evidence" true.
 */
export class Workspace {
  readonly root: string;
  readonly srcDir: string;
  readonly buildDir: string;
  readonly siteDir: string;
  readonly evidenceDir: string;
  private commands: RecordedCommand[] = [];

  constructor(root: string) {
    this.root = path.resolve(root);
    this.srcDir = path.join(this.root, "src");
    this.buildDir = path.join(this.root, "build");
    this.siteDir = path.join(this.root, "site");
    this.evidenceDir = path.join(this.root, "evidence");
  }

  async ensure(): Promise<void> {
    for (const dir of [this.root, this.evidenceDir]) {
      await mkdir(dir, { recursive: true });
    }
    await this.loadCommands();
  }

  private get commandsFile(): string {
    return path.join(this.evidenceDir, "commands.json");
  }

  private async loadCommands(): Promise<void> {
    if (existsSync(this.commandsFile)) {
      try {
        this.commands = JSON.parse(await readFile(this.commandsFile, "utf8"));
      } catch {
        this.commands = [];
      }
    }
  }

  /** Record a finished command. Only the tails of output are kept inline. */
  async record(label: string, result: CommandResult): Promise<void> {
    const entry: RecordedCommand = {
      label,
      command: formatCommand(result.command, result.args),
      cwd: result.cwd,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    };
    this.commands.push(entry);
    await mkdir(this.evidenceDir, { recursive: true });
    await writeFile(this.commandsFile, JSON.stringify(this.commands, null, 2));
  }

  getCommands(): RecordedCommand[] {
    return [...this.commands];
  }

  async writeJson(name: string, data: unknown): Promise<string> {
    await mkdir(this.evidenceDir, { recursive: true });
    const file = path.join(this.evidenceDir, name);
    await writeFile(file, JSON.stringify(data, null, 2));
    return file;
  }

  async readJson<T>(name: string): Promise<T | null> {
    const file = path.join(this.evidenceDir, name);
    if (!existsSync(file)) return null;
    return JSON.parse(await readFile(file, "utf8")) as T;
  }
}

function tail(text: string, lines = 40): string {
  const all = text.split(/\r?\n/);
  if (all.length <= lines) return text.trimEnd();
  return all.slice(-lines).join("\n").trimEnd();
}
