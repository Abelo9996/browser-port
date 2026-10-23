# Port report: Space shooter (MIT, SDL2, Hands-On Game Dev with WebAssembly Ch.7)

Generated 2026-10-23T08:00:58.236Z

Source: /tmp/ems/packt/Chapter07

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: cpp
- Build system: plain
- App kind: sdl2
- Entry point: main.cpp
- Portability: likely
- Libraries: SDL2, SDL2_image

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_IMAGE=2 -sSDL2_IMAGE_FORMATS=['png'] -I. --preload-file sprites@/sprites
- Asyncify: no
- Output: index.js, index.wasm, index.data

## Package

- Mode: canvas
- Site files: index.data, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: canvas
- Canvas draws non-blank frames: yes
- Frames observed: 265 over 4415 ms (60 fps)

Screenshots: canvas-start.png, canvas-end.png

## Commands run

- [build:em++] exit 1, 1080 ms: `em++ main.cpp -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_IMAGE=2 -sSDL2_IMAGE_FORMATS=['png'] -I. --preload-file sprites@/sprites -o /tmp/ports/packt07/…`
- [build:em++] exit 0, 2730 ms: `em++ collider.cpp enemy_ship.cpp main.cpp player_ship.cpp projectile.cpp projectile_pool.cpp ship.cpp -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_IMAGE=2…`
