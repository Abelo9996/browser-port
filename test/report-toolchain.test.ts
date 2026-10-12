import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { report } from "../src/ops/report.js";
import { detectToolchain, toolchainCommand } from "../src/ops/toolchain.js";

describe("report", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  it("renders markdown from evidence json files", async () => {
    const ws = await mkdtemp(path.join(tmpdir(), "bp-ws-"));
    dirs.push(ws);
    const ev = path.join(ws, "evidence");
    await mkdir(ev, { recursive: true });
    await writeFile(
      path.join(ev, "inspect.json"),
      JSON.stringify({
        source: "x",
        resolvedPath: ws,
        repo: { url: "https://example.com/r", commit: "abc123" },
        language: "c",
        buildSystem: "make",
        appKind: "stdio",
        libraries: [],
        assets: [],
        entryPoint: "main.c",
        sourceFiles: ["main.c"],
        usesBlockingMainLoop: false,
        portability: "likely",
        blockers: [],
        notes: [],
      }),
    );
    await writeFile(
      path.join(ev, "verify.json"),
      JSON.stringify({
        ok: true,
        mode: "canvas",
        consoleErrors: [],
        canvasNonBlank: true,
        fps: 59.5,
        frames: 180,
        durationMs: 3000,
        screenshots: ["/x/canvas-start.png"],
        notes: [],
      }),
    );

    const { md, json } = await report(ws, { title: "Demo", changes: ["swapped main loop"], limits: ["no audio"] });
    const text = await readFile(md, "utf8");
    expect(text).toContain("# Port report: Demo");
    expect(text).toContain("Commit: abc123");
    expect(text).toContain("59.5 fps");
    expect(text).toContain("swapped main loop");
    expect(text).toContain("no audio");
    expect(json.endsWith("report.json")).toBe(true);
  });
});

describe("toolchain", () => {
  it("returns a valid mode and a docker command wrapper", async () => {
    const info = await detectToolchain();
    expect(["local", "docker", "missing"]).toContain(info.mode);

    const wrapped = toolchainCommand({ mode: "docker", dockerImage: "emscripten/emsdk" }, "emcc", ["a.c", "-o", "a.js"], "/work");
    expect(wrapped.command).toBe("docker");
    expect(wrapped.args).toContain("emscripten/emsdk");
    expect(wrapped.args).toContain("emcc");

    const local = toolchainCommand({ mode: "local" }, "emcc", ["a.c"], "/work");
    expect(local.command).toBe("emcc");
    expect(local.args).toEqual(["a.c"]);
  });
});
