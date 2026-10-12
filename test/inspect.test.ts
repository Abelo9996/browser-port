import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { detect } from "../src/ops/inspect.js";
import { inspect } from "../src/ops/inspect.js";

async function makeTree(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "bp-fixture-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

describe("detect", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it("classifies an SDL2 game with a blocking loop", async () => {
    const root = await makeTree({
      "CMakeLists.txt": "project(game)\n",
      "src/main.c": `#include <SDL2/SDL.h>
#include <SDL_image.h>
int main(void){ SDL_Init(SDL_INIT_VIDEO);
  while (1) { SDL_Event e; SDL_PollEvent(&e); SDL_RenderPresent(0); }
  return 0; }`,
      "assets/sprite.png": "x",
    });
    dirs.push(root);
    const d = await detect(root);
    expect(d.language).toBe("c");
    expect(d.buildSystem).toBe("cmake");
    expect(d.appKind).toBe("sdl2");
    expect(d.libraries.map((l) => l.name)).toContain("SDL2");
    expect(d.libraries.map((l) => l.name)).toContain("SDL2_image");
    expect(d.usesBlockingMainLoop).toBe(true);
    expect(d.entryPoint).toBe("src/main.c");
    expect(d.assets).toContain("assets/sprite.png");
  });

  it("classifies a plain stdio C program", async () => {
    const root = await makeTree({
      Makefile: "all:\n\tcc main.c\n",
      "main.c": `#include <stdio.h>
int main(void){ int n; scanf("%d", &n); printf("%d\\n", n*2); return 0; }`,
    });
    dirs.push(root);
    const d = await detect(root);
    expect(d.language).toBe("c");
    expect(d.buildSystem).toBe("make");
    expect(d.appKind).toBe("stdio");
    expect(d.usesBlockingMainLoop).toBe(false);
  });

  it("marks a non C/C++ project not supported", async () => {
    const root = await makeTree({ "main.py": "print('hi')\n" });
    dirs.push(root);
    const r = await inspect(root);
    expect(r.portability).toBe("not-supported");
    expect(r.blockers[0]?.id).toBe("no-c-cpp");
  });

  it("flags sockets and pthreads as blockers but still needs-changes for stdio", async () => {
    const root = await makeTree({
      "main.c": `#include <stdio.h>
#include <pthread.h>
#include <sys/socket.h>
int main(void){ return 0; }`,
    });
    dirs.push(root);
    const r = await inspect(root);
    expect(r.portability).toBe("needs-changes");
    const ids = r.blockers.map((b) => b.id);
    expect(ids).toContain("sockets");
    expect(ids).toContain("pthreads");
  });
});
