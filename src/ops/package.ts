import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { BuildResult } from "../types.js";
import { Workspace } from "../util/evidence.js";
import { canvasShell, stdioShell } from "../templates/shell.js";

export interface PackageOptions {
  title?: string;
  mode?: "canvas" | "stdio";
  /** Optional path to a license file to carry into the site. */
  licenseFile?: string;
}

export interface PackageResult {
  siteDir: string;
  indexHtml: string;
  files: string[];
  mode: "canvas" | "stdio";
}

/**
 * Assemble a self-contained static site from a finished build. The result is a
 * folder that works from any static host with correct wasm MIME types.
 */
export async function packageSite(
  workspaceRoot: string,
  build: BuildResult,
  options: PackageOptions = {},
): Promise<PackageResult> {
  const ws = new Workspace(workspaceRoot);
  await ws.ensure();
  await mkdir(ws.siteDir, { recursive: true });

  if (!build.jsFile || !build.wasmFile) {
    throw new Error("cannot package: the build did not produce a .js and .wasm pair");
  }

  const copied: string[] = [];
  const copyInto = async (src: string) => {
    const base = path.basename(src);
    await copyFile(src, path.join(ws.siteDir, base));
    copied.push(base);
    return base;
  };

  const jsName = await copyInto(build.jsFile);
  await copyInto(build.wasmFile);
  if (build.dataFile && existsSync(build.dataFile)) await copyInto(build.dataFile);

  if (options.licenseFile && existsSync(options.licenseFile)) {
    await copyFile(options.licenseFile, path.join(ws.siteDir, "LICENSE"));
    copied.push("LICENSE");
  }

  const mode = options.mode ?? "canvas";
  const title = options.title ?? "browser-port app";
  const html = mode === "stdio" ? stdioShell(title, jsName) : canvasShell(title, jsName);
  const indexPath = path.join(ws.siteDir, "index.html");
  await writeFile(indexPath, html);
  copied.push("index.html");

  const result: PackageResult = {
    siteDir: ws.siteDir,
    indexHtml: indexPath,
    files: (await readdir(ws.siteDir)).sort(),
    mode,
  };
  await ws.writeJson("package.json", result);
  return result;
}
