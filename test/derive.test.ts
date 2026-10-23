import { describe, expect, it, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { derivePlan, parseCMakeSources, deriveAssets } from "../src/ops/derive.js";
import { walk } from "../src/util/scan.js";

async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "bp-derive-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

describe("parseCMakeSources", () => {
  it("extracts explicit sources from add_executable", () => {
    const out = parseCMakeSources("project(game)\nadd_executable(game src/main.c src/draw.c)\n");
    expect(out).toEqual(["src/main.c", "src/draw.c"]);
  });

  it("ignores target name and WIN32 keyword", () => {
    const out = parseCMakeSources("add_executable(app WIN32 a.cpp b.cpp)\n");
    expect(out).toEqual(["a.cpp", "b.cpp"]);
  });

  it("returns null when sources are behind a variable", () => {
    expect(parseCMakeSources("add_executable(app ${SRC})\n")).toBeNull();
  });
});

describe("deriveAssets", () => {
  it("preloads a referenced asset directory and detects png", () => {
    const r = deriveAssets(
      ["assets/player.png", "./assets/tiles.png"],
      new Map([["player.png", "assets/player.png"], ["tiles.png", "assets/tiles.png"]]),
      new Set(["assets"]),
    );
    expect(r.preloadDirs).toEqual(["assets"]);
    expect(r.imageFormats).toContain("png");
  });

  it("maps a bare asset filename to its real path at the virtual root", () => {
    const r = deriveAssets(["font.ttf"], new Map([["font.ttf", "src/assets/font.ttf"]]), new Set());
    expect(r.preloadMap).toEqual(["src/assets/font.ttf@/font.ttf"]);
  });

  it("adds jpg to image formats", () => {
    const r = deriveAssets(["img/bg.jpg"], new Map([["bg.jpg", "img/bg.jpg"]]), new Set(["img"]));
    expect(r.imageFormats).toContain("jpg");
  });
});

describe("derivePlan", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it("follows local includes from the entry file", async () => {
    const root = await makeTree({
      "main.c": `#include "game.h"\nint main(void){ return play(); }`,
      "game.c": `#include "game.h"\nint play(void){ return 0; }`,
      "game.h": `int play(void);`,
      "unrelated.c": `int other(void){ return 1; }`,
    });
    dirs.push(root);
    const files = await walk(root);
    const plan = await derivePlan(root, { entryPoint: "main.c", sourceFiles: files.filter((f) => f.endsWith(".c")) }, files);
    expect(plan.sources.sort()).toEqual(["game.c", "main.c"]);
    expect(plan.allSources).toContain("unrelated.c");
  });

  it("prefers explicit CMake sources", async () => {
    const root = await makeTree({
      "CMakeLists.txt": "add_executable(game src/main.c src/draw.c)\n",
      "src/main.c": `int main(void){ return 0; }`,
      "src/draw.c": `int draw(void){ return 0; }`,
      "src/extra.c": `int extra(void){ return 0; }`,
    });
    dirs.push(root);
    const files = await walk(root);
    const plan = await derivePlan(root, { entryPoint: "src/main.c", sourceFiles: files.filter((f) => f.endsWith(".c")) }, files);
    expect(plan.sources.sort()).toEqual(["src/main.c", "src/draw.c"].sort());
  });

  it("preloads a well-known asset dir and derives include dirs", async () => {
    const root = await makeTree({
      "main.c": `#include "inc/game.h"\nint main(void){ return 0; }`,
      "inc/game.h": `int x;`,
      "assets/sprite.png": "x",
    });
    dirs.push(root);
    const files = await walk(root);
    const plan = await derivePlan(root, { entryPoint: "main.c", sourceFiles: ["main.c"] }, files);
    expect(plan.preloadDirs).toContain("assets");
    expect(plan.includeDirs).toContain("inc");
  });
});
