import { describe, expect, it } from "vitest";
import { diagnoseBuild } from "../src/ops/diagnose.js";

describe("diagnoseBuild", () => {
  it("enables SDL2_image from an undefined IMG_ symbol", () => {
    const fix = diagnoseBuild("wasm-ld: error: undefined symbol: IMG_Load", { libs: ["SDL2"], sourcesComplete: true });
    expect(fix?.addLib).toBe("SDL2_image");
  });

  it("enables SDL2_mixer and SDL2_ttf from their symbols", () => {
    expect(diagnoseBuild("undefined symbol: Mix_LoadWAV", { libs: ["SDL2"], sourcesComplete: true })?.addLib).toBe("SDL2_mixer");
    expect(diagnoseBuild("undefined symbol: TTF_OpenFont", { libs: ["SDL2"], sourcesComplete: true })?.addLib).toBe("SDL2_ttf");
  });

  it("enables SDL2 from a missing SDL.h header", () => {
    const fix = diagnoseBuild("fatal error: 'SDL2/SDL.h' file not found", { libs: [], sourcesComplete: true });
    expect(fix?.addLib).toBe("SDL2");
  });

  it("maps a missing SDL_image.h header to SDL2_image, not core SDL", () => {
    const fix = diagnoseBuild("fatal error: 'SDL_image.h' file not found", { libs: ["SDL2"], sourcesComplete: true });
    expect(fix?.addLib).toBe("SDL2_image");
  });

  it("compiles all sources for a non-SDL undefined symbol", () => {
    const fix = diagnoseBuild("error: undefined symbol: update_world (referenced by top-level compiled C/C++ code)", {
      libs: ["SDL2"],
      sourcesComplete: false,
    });
    expect(fix?.compileAllSources).toBe(true);
  });

  it("does not loop once a library is already enabled", () => {
    const fix = diagnoseBuild("undefined symbol: IMG_Load", { libs: ["SDL2", "SDL2_image"], sourcesComplete: true });
    expect(fix).toBeNull();
  });

  it("does not ask to compile all sources once they are complete", () => {
    const fix = diagnoseBuild("undefined symbol: mystery_func", { libs: ["SDL2"], sourcesComplete: true });
    expect(fix).toBeNull();
  });

  it("returns null on output with no actionable error", () => {
    expect(diagnoseBuild("some unrelated warning", { libs: [], sourcesComplete: true })).toBeNull();
  });
});
