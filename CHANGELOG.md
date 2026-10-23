# Changelog

All notable changes to this project are recorded here. The format follows Keep a Changelog, and the
project uses semantic versioning.

## [0.2.0] - unreleased

### Added

- `port <github-url|path>`: the whole pipeline in one command and one MCP tool. It inspects, derives
  the sources (from a CMake `add_executable` or the file with `main` plus its local includes), the
  libraries, the app kind, and the asset preload map, then builds, packages, and verifies in headless
  Chrome, printing a playable link with the measured frame rate, or an honest not-supported with the
  blocker named.
- A bounded build retry ladder: on a failure `port` reads the compiler or linker output and applies a
  known fix in order (enable an SDL port library, compile all project sources, force-include
  `<emscripten.h>`, downgrade an implicit-declaration error, grow the stack on a wasm trap, or wrap a
  blocking loop in ASYNCIFY), recording each attempt.

### Changed

- Honest inspect: Qt, GTK, wxWidgets, native X11/GLX/WGL/Cocoa windowing, the Win32 GUI, raw sockets,
  and threads now return "not supported" with the reason instead of "likely" or "needs changes".
  OpenGL used through SDL2 or raylib is still supported. Vendored dependency directories (a bundled
  copy of SDL2, for example) are no longer scanned, so they cannot cause a false refusal.
- `verify` is bounded by per-call timeouts so a program with a blocking loop that never yields reports
  an honest "did not run" instead of hanging. Liveness is judged by advancing frames or sampled canvas
  changes rather than a single screenshot (a WebGL buffer reads back blank in headless Chrome), and a
  program's own non-fatal log lines no longer fail a port that keeps running.
- Headline and quickstart rewritten to match the real support matrix: C/C++ SDL and raylib games.

## [0.1.0] - 2026-10-12

First release. MVP scope: C and C++ programs that use SDL2 (and SDL2_image, SDL2_mixer, SDL2_ttf),
raylib, or plain stdin/stdout.

### Added

- `inspect`: clone and analyze a project, report portability with blockers and usual fixes.
- `toolchain`: find a local `emcc`, the `emscripten/emsdk` Docker image, or report how to install.
- `build`: compile to WebAssembly with the right Emscripten flags and record every command.
- `package`: assemble a self-contained static site with a canvas or terminal shell.
- `serve`: local preview server with correct wasm MIME type.
- `verify`: headless Chrome evidence (console errors, non-blank frames, fps, scripted keys,
  screenshots) and native versus browser comparison for stdio programs.
- `report`: Markdown and JSON evidence bundle, including a patch of source changes.
- `setup`: register the MCP server with Claude Code, Codex, and Cursor (dry run by default, with
  backups, idempotent).
- MCP server over stdio and a `browser-port` CLI with `--json` on every operation.
- Three worked examples: sdl-tetris, brainheck, and a not-supported Rust case.
