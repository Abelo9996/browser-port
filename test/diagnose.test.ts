import { describe, expect, it } from "vitest";
import { diagnoseBuild } from "../src/ops/diagnose.js";

describe("diagnoseBuild", () => {
  it("enables SDL2_image from an undefined IMG_ symbol", () => {
    const fix = diagnoseBuild("wasm-ld: error: undefined symbol: IMG_Load", { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] });
    expect(fix?.addLib).toBe("SDL2_image");
  });

  it("enables SDL2_mixer and SDL2_ttf from their symbols", () => {
    expect(diagnoseBuild("undefined symbol: Mix_LoadWAV", { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] })?.addLib).toBe("SDL2_mixer");
    expect(diagnoseBuild("undefined symbol: TTF_OpenFont", { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] })?.addLib).toBe("SDL2_ttf");
  });

  it("enables SDL2 from a missing SDL.h header", () => {
    const fix = diagnoseBuild("fatal error: 'SDL2/SDL.h' file not found", { libs: [], sourcesComplete: true, extraFlags: [] });
    expect(fix?.addLib).toBe("SDL2");
  });

  it("maps a missing SDL_image.h header to SDL2_image, not core SDL", () => {
    const fix = diagnoseBuild("fatal error: 'SDL_image.h' file not found", { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] });
    expect(fix?.addLib).toBe("SDL2_image");
  });

  it("compiles all sources for a non-SDL undefined symbol", () => {
    const fix = diagnoseBuild("error: undefined symbol: update_world (referenced by top-level compiled C/C++ code)", {
      libs: ["SDL2"],
      sourcesComplete: false,
      extraFlags: [],
    });
    expect(fix?.compileAllSources).toBe(true);
  });

  it("force-includes emscripten.h for an undeclared emscripten_ call", () => {
    const fix = diagnoseBuild(
      "src/sdl_app.c:126:5: error: call to undeclared function 'emscripten_set_main_loop_arg'; ISO C99 and later do not support implicit function declarations",
      { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] },
    );
    expect(fix?.addFlags).toEqual(["-include", "emscripten.h"]);
  });

  it("force-includes emscripten.h for a wasm signature mismatch", () => {
    const fix = diagnoseBuild("wasm-ld: error: function signature mismatch: emscripten_cancel_main_loop", {
      libs: ["SDL2"],
      sourcesComplete: true,
      extraFlags: [],
    });
    expect(fix?.addFlags).toEqual(["-include", "emscripten.h"]);
  });

  it("downgrades a non-emscripten implicit function declaration error", () => {
    const fix = diagnoseBuild("error: implicit declaration of function 'some_legacy_api'", {
      libs: ["SDL2"],
      sourcesComplete: true,
      extraFlags: [],
    });
    expect(fix?.addFlags).toEqual(["-Wno-implicit-function-declaration"]);
  });

  it("does not re-add the implicit-declaration flag once applied", () => {
    const fix = diagnoseBuild("error: implicit declaration of function 'foo'", {
      libs: ["SDL2"],
      sourcesComplete: true,
      extraFlags: ["-Wno-implicit-function-declaration"],
    });
    expect(fix).toBeNull();
  });

  it("does not loop once a library is already enabled", () => {
    const fix = diagnoseBuild("undefined symbol: IMG_Load", { libs: ["SDL2", "SDL2_image"], sourcesComplete: true, extraFlags: [] });
    expect(fix).toBeNull();
  });

  it("does not ask to compile all sources once they are complete", () => {
    const fix = diagnoseBuild("undefined symbol: mystery_func", { libs: ["SDL2"], sourcesComplete: true, extraFlags: [] });
    expect(fix).toBeNull();
  });

  it("returns null on output with no actionable error", () => {
    expect(diagnoseBuild("some unrelated warning", { libs: [], sourcesComplete: true, extraFlags: [] })).toBeNull();
  });
});
