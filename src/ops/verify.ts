import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { VerifyResult } from "../types.js";
import { Workspace } from "../util/evidence.js";
import { serve } from "./serve.js";
import { run } from "../util/exec.js";

export interface VerifyOptions {
  mode?: "canvas" | "stdio";
  /** Seconds to observe a canvas app for frames. */
  observeSeconds?: number;
  /** Scripted key presses for a canvas app. */
  keys?: { key: string; afterMs: number }[];
  /** For stdio: a native binary and inputs to compare against. */
  stdio?: {
    nativeBinary?: string;
    cases: { input: string }[];
  };
  crossOriginIsolation?: boolean;
}

interface PlaywrightModule {
  chromium: {
    launch: (opts: { headless: boolean; args?: string[] }) => Promise<{
      newPage: () => Promise<Page>;
      close: () => Promise<void>;
    }>;
  };
}

interface Page {
  goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  waitForFunction: (fn: string, arg?: unknown, opts?: { timeout?: number }) => Promise<unknown>;
  evaluate: <T>(fn: string) => Promise<T>;
  screenshot: (opts: { path: string }) => Promise<unknown>;
  keyboard: { press: (key: string) => Promise<void> };
  on: (event: string, cb: (msg: { type: () => string; text: () => string }) => void) => void;
  waitForTimeout: (ms: number) => Promise<void>;
  $: (selector: string) => Promise<ElementHandle | null>;
}

interface ElementHandle {
  screenshot: (opts: { path: string }) => Promise<Buffer>;
}

async function loadPlaywright(): Promise<PlaywrightModule | null> {
  try {
    return (await import("playwright")) as unknown as PlaywrightModule;
  } catch {
    return null;
  }
}

/**
 * Open the packaged site in headless Chromium and gather evidence: console
 * errors, whether the canvas draws, frames per second, response to scripted
 * keys, and screenshots. For stdio programs it compares the browser output
 * against a native build for the same inputs.
 */
export async function verify(workspaceRoot: string, options: VerifyOptions = {}): Promise<VerifyResult> {
  const ws = new Workspace(workspaceRoot);
  await ws.ensure();
  const shotsDir = path.join(ws.evidenceDir, "screenshots");
  await mkdir(shotsDir, { recursive: true });

  const mode = options.mode ?? "canvas";
  const pw = await loadPlaywright();
  if (!pw) {
    const result: VerifyResult = {
      ok: false,
      mode,
      consoleErrors: [],
      screenshots: [],
      notes: ["Playwright is not installed. Run `npm i playwright` and `npx playwright install chromium` to enable verify."],
    };
    await ws.writeJson("verify.json", result);
    return result;
  }

  const server = await serve(ws.siteDir, { crossOriginIsolation: options.crossOriginIsolation });
  const browser = await pw.chromium.launch({ headless: true });
  const consoleErrors: string[] = [];
  const notes: string[] = [];

  try {
    if (mode === "stdio") {
      const result = await verifyStdio(pw, browser, server.url, shotsDir, options, consoleErrors, notes);
      await ws.writeJson("verify.json", result);
      return result;
    }
    const result = await verifyCanvas(pw, browser, server.url, shotsDir, options, consoleErrors, notes);
    await ws.writeJson("verify.json", result);
    return result;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function makePage(browser: { newPage: () => Promise<Page> }, errors: string[]): Promise<Page> {
  const page = await browser.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (msg: unknown) => errors.push(String((msg as { text?: () => string }).text?.() ?? msg)));
  return page;
}

/** Screenshot just the canvas element, falling back to the full page. Returns the PNG bytes. */
async function screenshotCanvas(page: Page, file: string): Promise<Buffer | null> {
  const el = await page.$("#canvas");
  if (el) return el.screenshot({ path: file });
  await page.screenshot({ path: file });
  return null;
}

async function verifyCanvas(
  _pw: PlaywrightModule,
  browser: { newPage: () => Promise<Page> },
  baseUrl: string,
  shotsDir: string,
  options: VerifyOptions,
  consoleErrors: string[],
  notes: string[],
): Promise<VerifyResult> {
  const page = await makePage(browser, consoleErrors);
  const screenshots: string[] = [];
  await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 });

  await page.waitForFunction("window.__bp && window.__bp.started === true", undefined, { timeout: 30000 }).catch(() => {
    notes.push("Runtime did not report started within 30s.");
  });

  // A canvas element screenshot composites the real rendered frame, which is a
  // reliable signal. Reading the WebGL buffer directly is not, because SDL does
  // not preserve the drawing buffer between frames.
  const startBuf = await screenshotCanvas(page, path.join(shotsDir, "canvas-start.png"));
  screenshots.push(path.join(shotsDir, "canvas-start.png"));

  // Scripted key presses.
  const keySteps = options.keys ?? [];
  for (const step of keySteps) {
    await page.waitForTimeout(step.afterMs);
    await page.keyboard.press(step.key);
  }

  // Measure frames over the observation window.
  const observeMs = (options.observeSeconds ?? 3) * 1000;
  const framesBefore = await page.evaluate<number>("window.__bp.frames");
  const t0 = Date.now();
  await page.waitForTimeout(observeMs);
  const framesAfter = await page.evaluate<number>("window.__bp.frames");
  const elapsed = Date.now() - t0;
  const frames = framesAfter - framesBefore;
  const fps = Math.round((frames / elapsed) * 1000 * 10) / 10;

  const endBuf = await screenshotCanvas(page, path.join(shotsDir, "canvas-end.png"));
  screenshots.push(path.join(shotsDir, "canvas-end.png"));

  // Non-blank: the canvas screenshot is either non-uniform (larger than a solid
  // fill compresses to) or it changed across the observation window.
  const SOLID_PNG_MAX = 2000;
  const changed = startBuf !== null && endBuf !== null && !startBuf.equals(endBuf);
  const hasContent = (startBuf?.length ?? 0) > SOLID_PNG_MAX || (endBuf?.length ?? 0) > SOLID_PNG_MAX;
  const canvasNonBlank = changed || hasContent;
  if (changed) notes.push("Canvas content changed across the observation window.");

  const errors = await page.evaluate<string[]>("window.__bp.errors");
  for (const e of errors) if (!consoleErrors.includes(e)) consoleErrors.push(e);

  const ok = consoleErrors.length === 0 && frames > 0 && canvasNonBlank;
  return {
    ok,
    mode: "canvas",
    consoleErrors,
    canvasNonBlank,
    fps,
    frames,
    durationMs: elapsed,
    screenshots,
    keySteps: keySteps.map((k) => ({ key: k.key, afterMs: k.afterMs })),
    notes,
  };
}

async function verifyStdio(
  _pw: PlaywrightModule,
  browser: { newPage: () => Promise<Page> },
  baseUrl: string,
  shotsDir: string,
  options: VerifyOptions,
  consoleErrors: string[],
  notes: string[],
): Promise<VerifyResult> {
  const cases = options.stdio?.cases ?? [{ input: "" }];
  const comparisons: NonNullable<VerifyResult["stdioComparison"]> = [];
  const screenshots: string[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i]!;
    const page = await makePage(browser, consoleErrors);
    const encoded = Buffer.from(c.input, "utf8").toString("base64");
    await page.goto(`${baseUrl}?input=${encodeURIComponent(encoded)}`, { waitUntil: "load", timeout: 30000 });
    await page
      .waitForFunction("window.__bp && (window.__bp.exitCode !== null || window.__bp.started === true)", undefined, {
        timeout: 30000,
      })
      .catch(() => notes.push(`case ${i}: did not reach exit/start within 30s`));
    // Give the program a moment to flush output after start.
    await page.waitForTimeout(500);
    const browserOutput = normalize(await page.evaluate<string>("window.__bp.stdout"));

    let nativeOutput = "";
    if (options.stdio?.nativeBinary) {
      const res = await run(options.stdio.nativeBinary, [], { input: c.input, timeoutMs: 15000 });
      nativeOutput = normalize(res.stdout);
    }
    const shot = path.join(shotsDir, `stdio-case-${i}.png`);
    await page.screenshot({ path: shot });
    screenshots.push(shot);

    comparisons.push({
      input: c.input,
      nativeOutput,
      browserOutput,
      match: options.stdio?.nativeBinary ? nativeOutput === browserOutput : browserOutput.length > 0,
    });
  }

  const ok = consoleErrors.length === 0 && comparisons.every((c) => c.match);
  return {
    ok,
    mode: "stdio",
    consoleErrors,
    screenshots,
    stdioComparison: comparisons,
    notes,
  };
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").trimEnd();
}
