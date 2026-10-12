import { spawn } from "node:child_process";

export interface CommandResult {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  /** Maximum captured output per stream, in bytes. Prevents runaway logs. */
  maxBuffer?: number;
}

const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Run a command and capture its output. Never throws on a non-zero exit code;
 * the caller inspects exitCode. This is the single choke point every operation
 * routes external processes through, so every command can be recorded as
 * evidence.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER;
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : null;

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxBuffer) stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBuffer) stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        command,
        args,
        cwd,
        exitCode: null,
        signal: null,
        stdout,
        stderr: stderr + String(err instanceof Error ? err.message : err),
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({
        command,
        args,
        cwd,
        exitCode: code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    if (options.input !== undefined) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

/** True when a binary is runnable on PATH. */
export async function which(binary: string): Promise<string | null> {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = await run(probe, [binary]);
  if (result.exitCode !== 0) return null;
  const first = result.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return first ?? null;
}

/** A short one-line form of a command for logs and reports. */
export function formatCommand(command: string, args: string[]): string {
  const quoted = args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a));
  return [command, ...quoted].join(" ");
}
