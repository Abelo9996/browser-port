# Port report: pong (MIT, SDL2) ported with the yield shim

Generated 2026-10-23T08:38:29.708Z

Source: https://github.com/ucx15/pong
Commit: 7f9b91a3af821f23f6e7c091238b0f6cb2e1787f

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: cpp
- Build system: plain
- App kind: sdl2
- Entry point: Src/main.cpp
- Portability: needs-changes
- Libraries: SDL2, SDL2_ttf

Blockers and usual fixes:
- Uses a blocking main loop. Fix: Convert to emscripten_set_main_loop, or build with -sASYNCIFY so the blocking loop yields to the browser.

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sASYNCIFY -ISrc/Include --preload-file Imgs@/Imgs --preload-file Res@/Res -Wl,--wrap=SDL_PollEvent -Wl,--wrap=SDL_RenderPresent -Wl,--wrap=SDL_GL_SwapWindow -Wl,--wrap=SDL_UpdateWindowSurface
- Asyncify: yes
- Output: index.js, index.wasm, index.data

## Package

- Mode: canvas
- Site files: LICENSE, index.data, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: canvas
- Canvas draws non-blank frames: yes
- Liveness: canvas content changed over 4411 ms (ASYNCIFY yield loop; no requestAnimationFrame counter, so no fps figure)
- Scripted keys: Enter, Space

Screenshots: canvas-start.png, canvas-end.png

## Commands run

- [build:em++] exit 0, 4220 ms: `em++ Src/main.cpp Src/utils.cpp Src/puck.cpp Src/paddle.cpp Src/text.cpp -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 -sASYNCIFY -ISrc/Include --pre…`
- [build:em++] exit 0, 4569 ms: `em++ Src/main.cpp Src/utils.cpp Src/puck.cpp Src/paddle.cpp Src/text.cpp /tmp/ports/pong/build/__bp_yield_shim.c -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_…`
