# Port report: brainheck ported to the browser

Generated 2026-10-12T20:15:27.872Z

Source: .work/brainheck

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: c
- Build system: make
- App kind: stdio
- Entry point: brainheck.c
- Portability: likely

## Source changes

- Added read_all() and changed main() to read the Brainfuck program from stdin when no file argument is given, so it runs as a stdin to stdout filter in the browser.

Full diff: changes.patch

## Build

- Result: ok
- Flags: -O2 -sALLOW_MEMORY_GROWTH=1
- Asyncify: no
- Output: index.js, index.wasm

## Package

- Mode: stdio
- Site files: LICENSE, index.html, index.js, index.wasm

## Verification

- Result: pass
- Mode: stdio

Native vs browser output:
- input "++++++++[>++++[>++>+++>+++>+<<<<-]>+>+>->>+[<]<-]>>.>---.+++++++..+++.>>.<-.<.+++.------.--------.>>+.>++.": match

Screenshots: stdio-case-0.png

## Limits

- Programs that use the ',' input command cannot also receive runtime input through stdin in this build, because stdin is consumed as the program source. The included mandelbrot.bf needs no input and works, but is compute heavy (about 26 seconds).

## Commands run

- [build:emcc] exit 0, 1790 ms: `emcc brainheck.c -O2 -sALLOW_MEMORY_GROWTH=1 -o /Users/abelyagubyan/Downloads/browser-port/examples/brainheck/work/build/index.js`
