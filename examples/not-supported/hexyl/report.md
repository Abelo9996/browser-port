# Port report: hexyl: not supported yet

Generated 2026-10-12T20:16:46.347Z

Source: https://github.com/sharkdp/hexyl
Commit: 6ecc29b9c8c84d08a7e860f7f69c22b113b480ea

## Toolchain

- emcc: emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.12-git (/opt/homebrew/bin/emcc)

## Inspection

- Language: unknown
- Build system: unknown
- App kind: unknown
- Entry point: unknown
- Portability: not-supported

Blockers and usual fixes:
- No C or C++ source files were found. Fix: This MVP ports C and C++ programs. Other languages are not supported yet.

## Limits

- hexyl is written in Rust. This MVP ports C and C++ programs that use SDL2, raylib, or plain stdio. Other languages are out of scope.

## Commands run

