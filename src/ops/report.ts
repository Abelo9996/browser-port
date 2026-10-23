import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildResult, InspectReport, ToolchainInfo, VerifyResult } from "../types.js";
import { Workspace } from "../util/evidence.js";
import { detectToolchain } from "./toolchain.js";
import type { PackageResult } from "./package.js";

export interface ReportInput {
  title: string;
  /** Path to a unified diff of the source changes the agent made, if any. */
  patchFile?: string;
  /** Plain description of what was changed and why. */
  changes?: string[];
  /** Known limits to state honestly. */
  limits?: string[];
}

export interface ReportBundle {
  title: string;
  generatedAt: string;
  toolchain: ToolchainInfo;
  inspect: InspectReport | null;
  build: BuildResult | null;
  package: PackageResult | null;
  verify: VerifyResult | null;
  changes: string[];
  patchFile: string | null;
  limits: string[];
  commands: ReturnType<Workspace["getCommands"]>;
}

export async function report(workspaceRoot: string, input: ReportInput): Promise<{ md: string; json: string }> {
  const ws = new Workspace(workspaceRoot);
  await ws.ensure();

  const bundle: ReportBundle = {
    title: input.title,
    generatedAt: new Date().toISOString(),
    toolchain: await detectToolchain(),
    inspect: await ws.readJson<InspectReport>("inspect.json"),
    build: await ws.readJson<BuildResult>("build.json"),
    package: await ws.readJson<PackageResult>("package.json"),
    verify: await ws.readJson<VerifyResult>("verify.json"),
    changes: input.changes ?? [],
    patchFile: input.patchFile && existsSync(input.patchFile) ? input.patchFile : null,
    limits: input.limits ?? [],
    commands: ws.getCommands(),
  };

  const jsonPath = path.join(ws.evidenceDir, "report.json");
  await writeFile(jsonPath, JSON.stringify(bundle, null, 2));

  const md = renderMarkdown(bundle);
  const mdPath = path.join(ws.evidenceDir, "report.md");
  await writeFile(mdPath, md);

  return { md: mdPath, json: jsonPath };
}

function renderMarkdown(b: ReportBundle): string {
  const L: string[] = [];
  L.push(`# Port report: ${b.title}`, "");
  L.push(`Generated ${b.generatedAt}`, "");

  if (b.inspect?.repo) {
    L.push(`Source: ${b.inspect.repo.url}`);
    L.push(`Commit: ${b.inspect.repo.commit}`, "");
  } else if (b.inspect) {
    L.push(`Source: ${b.inspect.source}`, "");
  }

  L.push("## Toolchain", "");
  if (b.toolchain.mode === "local") {
    L.push(`- emcc: ${b.toolchain.emccVersion ?? "local"} (${b.toolchain.emccPath})`);
  } else if (b.toolchain.mode === "docker") {
    L.push(`- Docker image: ${b.toolchain.dockerImage}`);
  } else {
    L.push("- No toolchain available at report time.");
  }
  L.push("");

  if (b.inspect) {
    L.push("## Inspection", "");
    L.push(`- Language: ${b.inspect.language}`);
    L.push(`- Build system: ${b.inspect.buildSystem}`);
    L.push(`- App kind: ${b.inspect.appKind}`);
    L.push(`- Entry point: ${b.inspect.entryPoint ?? "unknown"}`);
    L.push(`- Portability: ${b.inspect.portability}`);
    if (b.inspect.libraries.length) {
      L.push(`- Libraries: ${b.inspect.libraries.map((l) => l.name).join(", ")}`);
    }
    if (b.inspect.blockers.length) {
      L.push("", "Blockers and usual fixes:");
      for (const bl of b.inspect.blockers) L.push(`- ${bl.what} Fix: ${bl.fix}`);
    }
    L.push("");
  }

  if (b.changes.length || b.patchFile) {
    L.push("## Source changes", "");
    for (const c of b.changes) L.push(`- ${c}`);
    if (b.patchFile) L.push("", `Full diff: ${path.basename(b.patchFile)}`);
    L.push("");
  }

  if (b.build) {
    L.push("## Build", "");
    L.push(`- Result: ${b.build.ok ? "ok" : "failed"}`);
    L.push(`- Flags: ${b.build.flags.join(" ")}`);
    L.push(`- Asyncify: ${b.build.usedAsyncify ? "yes" : "no"}`);
    if (b.build.jsFile) L.push(`- Output: ${path.basename(b.build.jsFile)}, ${b.build.wasmFile ? path.basename(b.build.wasmFile) : "no wasm"}${b.build.dataFile ? ", " + path.basename(b.build.dataFile) : ""}`);
    L.push("");
  }

  if (b.package) {
    L.push("## Package", "");
    L.push(`- Mode: ${b.package.mode}`);
    L.push(`- Site files: ${b.package.files.join(", ")}`);
    L.push("");
  }

  if (b.verify) {
    L.push("## Verification", "");
    L.push(`- Result: ${b.verify.ok ? "pass" : "fail"}`);
    L.push(`- Mode: ${b.verify.mode}`);
    if (b.verify.mode === "canvas") {
      L.push(`- Canvas draws non-blank frames: ${b.verify.canvasNonBlank ? "yes" : "no"}`);
      if (b.verify.fps != null && (b.verify.frames ?? 0) > 0) {
        L.push(`- Frames observed: ${b.verify.frames} over ${b.verify.durationMs} ms (${b.verify.fps} fps)`);
      } else {
        L.push(`- Liveness: canvas content changed over ${b.verify.durationMs} ms (ASYNCIFY yield loop; no requestAnimationFrame counter, so no fps figure)`);
      }
      if (b.verify.keySteps?.length) {
        L.push(`- Scripted keys: ${b.verify.keySteps.map((k) => k.key).join(", ")}`);
      }
    }
    if (b.verify.stdioComparison?.length) {
      L.push("", "Native vs browser output:");
      for (const c of b.verify.stdioComparison) {
        L.push(`- input ${JSON.stringify(c.input)}: ${c.match ? "match" : "differ"}`);
      }
    }
    if (b.verify.consoleErrors.length) {
      L.push("", "Console errors:");
      for (const e of b.verify.consoleErrors.slice(0, 20)) L.push(`- ${e}`);
    }
    if (b.verify.screenshots.length) {
      L.push("", `Screenshots: ${b.verify.screenshots.map((s) => path.basename(s)).join(", ")}`);
    }
    L.push("");
  }

  if (b.limits.length) {
    L.push("## Limits", "");
    for (const l of b.limits) L.push(`- ${l}`);
    L.push("");
  }

  L.push("## Commands run", "");
  for (const c of b.commands) {
    L.push(`- [${c.label}] exit ${c.exitCode}, ${c.durationMs} ms: \`${truncate(c.command, 160)}\``);
  }
  L.push("");

  return L.join("\n");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export async function loadJsonIfExists<T>(file: string): Promise<T | null> {
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as T;
}
