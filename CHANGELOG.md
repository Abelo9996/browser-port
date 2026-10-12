# Changelog

All notable changes to this project are recorded here. The format follows Keep a Changelog, and the
project uses semantic versioning.

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
