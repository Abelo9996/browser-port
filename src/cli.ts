#!/usr/bin/env node
import { Command } from "commander";
import { inspect } from "./ops/inspect.js";
import { detectToolchain } from "./ops/toolchain.js";
import { build } from "./ops/build.js";
import { packageSite } from "./ops/package.js";
import { serve } from "./ops/serve.js";
import { verify } from "./ops/verify.js";
import { report } from "./ops/report.js";
import { runSetup } from "./setup/setup.js";
import { startMcpServer } from "./mcp/server.js";

const program = new Command();
program
  .name("browser-port")
  .description("Port open-source desktop apps and games to the browser.")
  .version("0.1.0");

function out(json: boolean, data: unknown, human: () => void): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    human();
  }
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command("inspect")
  .argument("<source>", "GitHub URL or local path")
  .option("--json", "output JSON", false)
  .option("--dest <dir>", "clone destination for URLs")
  .action(async (source, opts) => {
    const r = await inspect(source, { destDir: opts.dest });
    out(opts.json, r, () => {
      console.log(`Source: ${r.source}`);
      console.log(`Language: ${r.language}  Build: ${r.buildSystem}  Kind: ${r.appKind}`);
      console.log(`Entry point: ${r.entryPoint ?? "unknown"}`);
      if (r.libraries.length) console.log(`Libraries: ${r.libraries.map((l) => l.name).join(", ")}`);
      console.log(`Portability: ${r.portability}`);
      for (const b of r.blockers) console.log(`  blocker: ${b.what} -> ${b.fix}`);
      for (const n of r.notes) console.log(`  note: ${n}`);
    });
  });

program
  .command("toolchain")
  .option("--json", "output JSON", false)
  .action(async (opts) => {
    const r = await detectToolchain();
    out(opts.json, r, () => {
      console.log(`Mode: ${r.mode}`);
      if (r.emccVersion) console.log(r.emccVersion);
      if (r.dockerImage) console.log(`Docker image: ${r.dockerImage} (available: ${r.dockerAvailable})`);
      if (r.installHint) console.log(r.installHint);
    });
  });

program
  .command("build")
  .argument("<workspace>", "workspace directory")
  .requiredOption("--source <dir>", "directory holding source to compile")
  .option("--sources <files...>", "source files relative to --source", [])
  .option("--app-kind <kind>", "sdl2 | raylib | stdio", "stdio")
  .option("--libs <names...>", "detected libraries (SDL2, SDL2_image, ...)", [])
  .option("--out <name>", "output basename", "index")
  .option("--preload <dirs...>", "directories to preload into the virtual FS", [])
  .option("--asyncify", "wrap a blocking main loop with ASYNCIFY", false)
  .option("--flags <flags...>", "extra emcc flags", [])
  .option("--json", "output JSON", false)
  .action(async (workspace, opts) => {
    const r = await build(
      workspace,
      {
        sourceDir: opts.source,
        sources: opts.sources,
        appKind: opts.appKind,
        outName: opts.out,
        preload: opts.preload,
        useAsyncify: opts.asyncify,
        extraFlags: opts.flags,
      },
      opts.libs,
    );
    out(opts.json, r, () => {
      console.log(`Build ${r.ok ? "ok" : "failed"}`);
      console.log(`Flags: ${r.flags.join(" ")}`);
      if (r.jsFile) console.log(`Output dir: ${r.outDir}`);
      if (!r.ok) {
        const last = r.commands[r.commands.length - 1];
        if (last) console.log(last.stderrTail || last.stdoutTail);
      }
    });
    if (!r.ok) process.exitCode = 1;
  });

program
  .command("package")
  .argument("<workspace>", "workspace directory")
  .option("--title <title>", "page title", "browser-port app")
  .option("--mode <mode>", "canvas | stdio", "canvas")
  .option("--license <file>", "license file to carry into the site")
  .option("--json", "output JSON", false)
  .action(async (workspace, opts) => {
    const buildJson = await import("./util/evidence.js").then(async ({ Workspace }) => {
      const ws = new Workspace(workspace);
      await ws.ensure();
      return ws.readJson<import("./types.js").BuildResult>("build.json");
    });
    if (!buildJson) throw new Error("no build.json in workspace; run build first");
    const r = await packageSite(workspace, buildJson, {
      title: opts.title,
      mode: opts.mode,
      licenseFile: opts.license,
    });
    out(opts.json, r, () => {
      console.log(`Site: ${r.siteDir}`);
      console.log(`Files: ${r.files.join(", ")}`);
    });
  });

program
  .command("serve")
  .argument("<siteDir>", "static site directory")
  .option("--port <port>", "port", (v) => parseInt(v, 10))
  .option("--coi", "add COOP/COEP headers for threads", false)
  .action(async (siteDir, opts) => {
    const handle = await serve(siteDir, { port: opts.port, crossOriginIsolation: opts.coi });
    console.log(`Serving ${siteDir} at ${handle.url}`);
    console.log("Press Ctrl+C to stop.");
    process.on("SIGINT", async () => {
      await handle.close();
      process.exit(0);
    });
  });

program
  .command("verify")
  .argument("<workspace>", "workspace directory")
  .option("--mode <mode>", "canvas | stdio", "canvas")
  .option("--seconds <n>", "seconds to observe canvas frames", (v) => parseInt(v, 10), 3)
  .option("--native <binary>", "native binary to compare against (stdio)")
  .option("--input <text>", "stdio input case (repeatable)", collect, [])
  .option("--json", "output JSON", false)
  .action(async (workspace, opts) => {
    const r = await verify(workspace, {
      mode: opts.mode,
      observeSeconds: opts.seconds,
      stdio:
        opts.mode === "stdio"
          ? { nativeBinary: opts.native, cases: (opts.input as string[]).map((input) => ({ input })) }
          : undefined,
    });
    out(opts.json, r, () => {
      console.log(`Verify ${r.ok ? "pass" : "fail"} (${r.mode})`);
      if (r.mode === "canvas") console.log(`Frames: ${r.frames}, fps: ${r.fps}, non-blank: ${r.canvasNonBlank}`);
      if (r.stdioComparison) for (const c of r.stdioComparison) console.log(`  input ${JSON.stringify(c.input)}: ${c.match ? "match" : "differ"}`);
      for (const e of r.consoleErrors) console.log(`  console error: ${e}`);
      for (const n of r.notes) console.log(`  note: ${n}`);
    });
    if (!r.ok) process.exitCode = 1;
  });

program
  .command("report")
  .argument("<workspace>", "workspace directory")
  .requiredOption("--title <title>", "report title")
  .option("--patch <file>", "unified diff of source changes")
  .option("--change <text>", "a source change description (repeatable)", collect, [])
  .option("--limit <text>", "a known limit (repeatable)", collect, [])
  .option("--json", "output JSON", false)
  .action(async (workspace, opts) => {
    const r = await report(workspace, {
      title: opts.title,
      patchFile: opts.patch,
      changes: opts.change,
      limits: opts.limit,
    });
    out(opts.json, r, () => {
      console.log(`Report written:`);
      console.log(`  ${r.md}`);
      console.log(`  ${r.json}`);
    });
  });

program
  .command("setup")
  .description("register the MCP server with Claude Code, Codex, and Cursor")
  .option("--yes", "apply changes (default is a dry run)", false)
  .option("--json", "output JSON", false)
  .action(async (opts) => {
    const r = await runSetup({ apply: opts.yes });
    out(opts.json, r, () => {
      console.log(r.apply ? "Applied setup:" : "Dry run (pass --yes to apply):");
      for (const a of r.actions) console.log(`  [${a.target}] ${a.status}: ${a.detail}`);
    });
  });

program
  .command("mcp")
  .description("run the MCP server over stdio")
  .action(async () => {
    await startMcpServer();
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
});
