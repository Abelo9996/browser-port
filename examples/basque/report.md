# Port report: Basque (MPL-2.0, SDL2 top-down engine)

Generated 2026-10-23T08:00:57.980Z

Source: https://github.com/ryanpcmcquen/basque
Commit: da59ea94202f499e2b8bd95b69d59610ff0c7002

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: c
- Build system: make
- App kind: sdl2
- Entry point: source/basque.c
- Portability: needs-changes
- Libraries: SDL2_image, SDL2_mixer, SDL2_ttf, SDL2

Blockers and usual fixes:
- Writes files at runtime. Fix: Use IDBFS for persistence and call FS.syncfs, or accept that writes live only in memory for the session.

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_IMAGE=2 -sSDL2_IMAGE_FORMATS=['png'] -sUSE_SDL_MIXER=2 -sUSE_SDL_TTF=2 -Isource --preload-file assets@/assets
- Asyncify: no
- Output: index.js, index.wasm, index.data

## Package

- Mode: canvas
- Site files: LICENSE, index.data, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: canvas
- Canvas draws non-blank frames: no
- Frames observed: 318 over 6350 ms (50.1 fps)

Console errors:
- ERROR: IMG_Init: JPEG images are not supported

Screenshots: canvas-start.png, canvas-end.png

## Commands run

- [build:emcc] exit 0, 2175 ms: `emcc source/basque.c -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_IMAGE=2 -sSDL2_IMAGE_FORMATS=['png'] -sUSE_SDL_MIXER=2 -sUSE_SDL_TTF=2 -Isource --preloa…`
