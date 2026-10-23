# Port report: saanp.vi (MIT, SDL2 snake) ported with the yield shim

Generated 2026-10-23T08:38:29.498Z

Source: https://github.com/iambasantarai/saanp.vi
Commit: 2674a30217c7e865f2c44b541c28658b522b84fb

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: c
- Build system: make
- App kind: sdl2
- Entry point: src/main.c
- Portability: needs-changes
- Libraries: SDL2, SDL2_ttf

Blockers and usual fixes:
- Uses a blocking main loop. Fix: Convert to emscripten_set_main_loop, or build with -sASYNCIFY so the blocking loop yields to the browser.

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sASYNCIFY -Isrc --preload-file assets@/assets -Wl,--wrap=SDL_PollEvent -Wl,--wrap=SDL_RenderPresent -Wl,--wrap=SDL_GL_SwapWindow -Wl,--wrap=SDL_UpdateWindowSurface
- Asyncify: yes
- Output: index.js, index.wasm, index.data

## Package

- Mode: canvas
- Site files: LICENSE, index.data, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: canvas
- Canvas draws non-blank frames: yes
- Liveness: canvas content changed over 4355 ms (ASYNCIFY yield loop; no requestAnimationFrame counter, so no fps figure)
- Scripted keys: Enter, Space

Screenshots: canvas-start.png, canvas-end.png

## Commands run

- [build:emcc] exit 0, 3432 ms: `emcc src/main.c src/logic.c src/rendering.c -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sASYNCIFY -Isrc --preload-file assets@/assets -o /tmp/port…`
- [build:emcc] exit 0, 3081 ms: `emcc src/main.c src/logic.c src/rendering.c /tmp/ports/saanp/build/__bp_yield_shim.c -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sASYNCIFY -Isrc -…`
