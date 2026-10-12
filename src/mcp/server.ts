import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { inspect } from "../ops/inspect.js";
import { detectToolchain } from "../ops/toolchain.js";
import { build } from "../ops/build.js";
import { packageSite } from "../ops/package.js";
import { serve } from "../ops/serve.js";
import { verify } from "../ops/verify.js";
import { report } from "../ops/report.js";
import { Workspace } from "../util/evidence.js";
import type { BuildResult } from "../types.js";

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: String(err instanceof Error ? err.message : err) }],
  };
}

/**
 * The MCP server exposes each operation as a tool. The tool does the reliable
 * work and returns evidence; the host agent decides what to run next. The tool
 * itself never calls a model.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "browser-port", version: "0.1.0" });

  server.tool(
    "inspect",
    "Clone or open a C/C++ project and report whether it can be ported to the browser, with blockers and usual fixes.",
    { source: z.string().describe("GitHub URL or local path"), dest: z.string().optional() },
    async ({ source, dest }) => {
      try {
        return json(await inspect(source, { destDir: dest }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool("toolchain", "Find or describe how to get an Emscripten toolchain (local emcc, Docker, or install hint).", {}, async () => {
    try {
      return json(await detectToolchain());
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    "build",
    "Compile the sources to WebAssembly with the right Emscripten flags. Records every command.",
    {
      workspace: z.string(),
      source: z.string().describe("directory holding the source to compile"),
      sources: z.array(z.string()).describe("source files relative to source dir"),
      appKind: z.enum(["sdl2", "raylib", "stdio", "cpp", "c", "unknown"]).default("stdio"),
      libs: z.array(z.string()).default([]),
      out: z.string().default("index"),
      preload: z.array(z.string()).default([]),
      asyncify: z.boolean().default(false),
      flags: z.array(z.string()).default([]),
    },
    async (a) => {
      try {
        const r = await build(
          a.workspace,
          {
            sourceDir: a.source,
            sources: a.sources,
            appKind: a.appKind as never,
            outName: a.out,
            preload: a.preload,
            useAsyncify: a.asyncify,
            extraFlags: a.flags,
          },
          a.libs,
        );
        return json(r);
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "package",
    "Assemble a self-contained static site from a finished build.",
    {
      workspace: z.string(),
      title: z.string().default("browser-port app"),
      mode: z.enum(["canvas", "stdio"]).default("canvas"),
      license: z.string().optional(),
    },
    async (a) => {
      try {
        const ws = new Workspace(a.workspace);
        await ws.ensure();
        const buildJson = await ws.readJson<BuildResult>("build.json");
        if (!buildJson) return fail(new Error("no build.json in workspace; run build first"));
        return json(await packageSite(a.workspace, buildJson, { title: a.title, mode: a.mode, licenseFile: a.license }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "serve",
    "Start a local static preview server with correct wasm MIME type. The server stays up while the MCP process runs.",
    { siteDir: z.string(), port: z.number().optional() },
    async (a) => {
      try {
        const handle = await serve(a.siteDir, { port: a.port });
        return json({ url: handle.url, port: handle.port });
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "verify",
    "Open the packaged site in headless Chromium and record evidence: console errors, non-blank frames, fps, scripted keys, screenshots. For stdio, compares against a native binary.",
    {
      workspace: z.string(),
      mode: z.enum(["canvas", "stdio"]).default("canvas"),
      seconds: z.number().default(3),
      native: z.string().optional(),
      inputs: z.array(z.string()).default([]),
    },
    async (a) => {
      try {
        return json(
          await verify(a.workspace, {
            mode: a.mode,
            observeSeconds: a.seconds,
            stdio: a.mode === "stdio" ? { nativeBinary: a.native, cases: a.inputs.map((input) => ({ input })) } : undefined,
          }),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.tool(
    "report",
    "Write a Markdown and JSON evidence bundle from the workspace.",
    {
      workspace: z.string(),
      title: z.string(),
      patch: z.string().optional(),
      changes: z.array(z.string()).default([]),
      limits: z.array(z.string()).default([]),
    },
    async (a) => {
      try {
        return json(await report(a.workspace, { title: a.title, patchFile: a.patch, changes: a.changes, limits: a.limits }));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
