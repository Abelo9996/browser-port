import { describe, expect, it, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { serve } from "../src/ops/serve.js";
import { canvasShell, stdioShell } from "../src/templates/shell.js";

describe("serve", () => {
  const handles: { close: () => Promise<void> }[] = [];
  const dirs: string[] = [];
  afterEach(async () => {
    for (const h of handles.splice(0)) await h.close();
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  it("serves wasm with the correct MIME type", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bp-site-"));
    dirs.push(dir);
    await writeFile(path.join(dir, "index.html"), "<!doctype html><title>ok</title>");
    await writeFile(path.join(dir, "index.wasm"), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    const h = await serve(dir);
    handles.push(h);

    const html = await fetch(h.url);
    expect(html.status).toBe(200);
    expect(html.headers.get("content-type")).toContain("text/html");

    const wasm = await fetch(h.url + "index.wasm");
    expect(wasm.headers.get("content-type")).toBe("application/wasm");

    const missing = await fetch(h.url + "nope.js");
    expect(missing.status).toBe(404);
  });

  it("blocks path traversal", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "bp-site-"));
    dirs.push(dir);
    await writeFile(path.join(dir, "index.html"), "ok");
    const h = await serve(dir);
    handles.push(h);
    const res = await fetch(h.url + "../../etc/passwd");
    expect([403, 404]).toContain(res.status);
  });
});

describe("shells", () => {
  it("canvas shell exposes the bp hooks and a canvas", () => {
    const html = canvasShell("My Game", "index.js");
    expect(html).toContain('id="canvas"');
    expect(html).toContain("window.__bp");
    expect(html).toContain('src="index.js"');
    expect(html).toContain("requestFullscreen");
    expect(/[\u2013\u2014]/.test(html)).toBe(false); // no en or em dashes
  });

  it("stdio shell reads scripted input and shows a terminal", () => {
    const html = stdioShell("Tool", "index.js");
    expect(html).toContain('id="term"');
    expect(html).toContain("URLSearchParams");
    expect(html).toContain("inputQueue");
  });
});
