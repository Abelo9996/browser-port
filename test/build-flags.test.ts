import { describe, expect, it } from "vitest";
import { flagsFor } from "../src/ops/build.js";

describe("flagsFor", () => {
  it("adds SDL2 and image flags from detected libs", () => {
    const flags = flagsFor({ sourceDir: ".", sources: ["main.c"], appKind: "sdl2" }, ["SDL2", "SDL2_image"]);
    expect(flags).toContain("-sUSE_SDL=2");
    expect(flags).toContain("-sUSE_SDL_IMAGE=2");
    expect(flags).toContain("-sALLOW_MEMORY_GROWTH=1");
  });

  it("adds raylib web flags", () => {
    const flags = flagsFor({ sourceDir: ".", sources: ["main.c"], appKind: "raylib" }, ["raylib"]);
    expect(flags).toContain("-sUSE_GLFW=3");
    expect(flags).toContain("-DPLATFORM_WEB");
  });

  it("adds ASYNCIFY only when requested", () => {
    const without = flagsFor({ sourceDir: ".", sources: ["m.c"], appKind: "stdio" }, []);
    expect(without).not.toContain("-sASYNCIFY");
    const withIt = flagsFor({ sourceDir: ".", sources: ["m.c"], appKind: "stdio", useAsyncify: true }, []);
    expect(withIt).toContain("-sASYNCIFY");
  });

  it("builds preload file flags", () => {
    const flags = flagsFor({ sourceDir: ".", sources: ["m.c"], appKind: "sdl2", preload: ["assets"] }, ["SDL2"]);
    const i = flags.indexOf("--preload-file");
    expect(i).toBeGreaterThanOrEqual(0);
    expect(flags[i + 1]).toBe("assets@/assets");
  });
});
