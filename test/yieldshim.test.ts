import { describe, expect, it } from "vitest";
import { YIELD_WRAPPED, yieldShimSource, yieldShimWrapFlags } from "../src/ops/yieldshim.js";

describe("yield shim", () => {
  it("wraps SDL_PollEvent and the frame present calls", () => {
    expect([...YIELD_WRAPPED]).toEqual([
      "SDL_PollEvent",
      "SDL_RenderPresent",
      "SDL_GL_SwapWindow",
      "SDL_UpdateWindowSurface",
    ]);
  });

  it("emits a --wrap flag for each wrapped function", () => {
    expect(yieldShimWrapFlags()).toEqual([
      "-Wl,--wrap=SDL_PollEvent",
      "-Wl,--wrap=SDL_RenderPresent",
      "-Wl,--wrap=SDL_GL_SwapWindow",
      "-Wl,--wrap=SDL_UpdateWindowSurface",
    ]);
  });

  it("defines a __wrap_/__real_ pair per function and yields via emscripten_sleep", () => {
    const src = yieldShimSource();
    for (const fn of YIELD_WRAPPED) {
      expect(src).toContain(`__wrap_${fn}`);
      expect(src).toContain(`__real_${fn}`);
    }
    expect(src).toContain("emscripten_sleep(0)");
    // SDL_PollEvent yields only when the queue is empty.
    expect(src).toMatch(/if \(!r\) emscripten_sleep\(0\)/);
    // C linkage so the wrap names survive the C++ driver (em++) unmangled.
    expect(src).toContain('extern "C"');
  });

  it("has no en or em dashes", () => {
    const src = yieldShimSource();
    const hasDash = [0x2013, 0x2014].some((c) => src.indexOf(String.fromCharCode(c)) !== -1);
    expect(hasDash).toBe(false);
  });
});
