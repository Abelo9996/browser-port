/**
 * A build-time yield shim for blocking SDL main loops.
 *
 * Desktop SDL games commonly run a plain `while (running) { poll; update;
 * present; }` loop, and some busy-wait on a start screen with
 * `while (!started) { while (SDL_PollEvent(&e)) ... }`. Under Emscripten such a
 * loop never returns control to the browser, so the page freezes.
 *
 * Rather than rewrite the game's source, we link with wasm-ld `--wrap` so our
 * wrappers intercept the real SDL calls at the frame boundary and the idle
 * event poll, calling `emscripten_sleep(0)` (which, with ASYNCIFY, unwinds the
 * stack and resumes on a later task) so the browser can render and deliver
 * input. SDL_PollEvent yields only when the queue is empty, which is exactly
 * the idle busy-wait; the present/swap wrappers yield once per drawn frame.
 */

/** The SDL entry points the shim wraps. */
export const YIELD_WRAPPED = [
  "SDL_PollEvent",
  "SDL_RenderPresent",
  "SDL_GL_SwapWindow",
  "SDL_UpdateWindowSurface",
] as const;

/** The C source of the shim. Pointers are void* so it needs no SDL headers; at
 *  the wasm level every pointer is i32, so the wrapped signatures still match. */
export function yieldShimSource(): string {
  return `/* browser-port build-time yield shim (generated). Not a source change:
   it is linked with wasm-ld --wrap so a blocking SDL loop yields to the
   browser each frame via ASYNCIFY. */
#include <emscripten.h>

/* Keep C linkage so the __wrap_/__real_ names are not mangled when this file is
   compiled by the C++ driver (em++) for a C++ game. */
#ifdef __cplusplus
extern "C" {
#endif

extern int __real_SDL_PollEvent(void *event);
int __wrap_SDL_PollEvent(void *event) {
  int r = __real_SDL_PollEvent(event);
  if (!r) emscripten_sleep(0);
  return r;
}

extern void __real_SDL_RenderPresent(void *renderer);
void __wrap_SDL_RenderPresent(void *renderer) {
  __real_SDL_RenderPresent(renderer);
  emscripten_sleep(0);
}

extern void __real_SDL_GL_SwapWindow(void *window);
void __wrap_SDL_GL_SwapWindow(void *window) {
  __real_SDL_GL_SwapWindow(window);
  emscripten_sleep(0);
}

extern int __real_SDL_UpdateWindowSurface(void *window);
int __wrap_SDL_UpdateWindowSurface(void *window) {
  int rc = __real_SDL_UpdateWindowSurface(window);
  emscripten_sleep(0);
  return rc;
}

#ifdef __cplusplus
}
#endif
`;
}

/** The emcc/wasm-ld flags that activate the shim. ASYNCIFY is added separately
 *  via the build spec so it is not duplicated. */
export function yieldShimWrapFlags(): string[] {
  return YIELD_WRAPPED.map((fn) => `-Wl,--wrap=${fn}`);
}
