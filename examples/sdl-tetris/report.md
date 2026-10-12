# Port report: SDL Tetris ported to the browser

Generated 2026-10-12T20:13:25.126Z

Source: .work/sdl-tetris

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: c
- Build system: make
- App kind: sdl2
- Entry point: src/main.c
- Portability: likely
- Libraries: SDL2, SDL2_ttf

## Source changes

- No source edits were needed: the upstream project already guards its main loop with __EMSCRIPTEN__ and calls emscripten_set_main_loop.

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 --preload-file src/assets/font.ttf@font.ttf
- Asyncify: no
- Output: index.js, index.wasm, index.data

## Package

- Mode: canvas
- Site files: LICENSE, index.data, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: canvas
- Canvas draws non-blank frames: yes
- Frames observed: 172 over 3003 ms (57.3 fps)

Screenshots: canvas-start.png, canvas-end.png

## Limits

- Keyboard controls work when the canvas has focus (click it first).
- Audio is not used by this game, so no audio path was exercised.

## Commands run

- [build:emcc] exit 0, 144195 ms: `emcc src/game.c src/graphics.c src/input.c src/main.c -O2 -sALLOW_MEMORY_GROWTH=1 -sUSE_SDL=2 -sUSE_SDL_TTF=2 --preload-file src/assets/font.ttf@font.ttf -o /U…`
