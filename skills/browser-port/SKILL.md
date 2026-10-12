---
name: browser-port
description: Port an open-source C or C++ desktop app or game (SDL2, raylib, or stdin/stdout) to the browser so it runs from a link. Use when the user wants to run a native program on the web, make a desktop game playable in a browser, or share a C/C++ tool as a web page. Drives Emscripten, a headless browser, and a static site builder; records evidence at every step.
---

# browser-port

You give the user the power to port a desktop app or game to the browser. You decide what to do; the
`browser-port` tools do the reliable work (Emscripten, packaging, headless-browser verification) and
record evidence. The tools never call a model. You call them in order and read their output.

## What is supported

- C and C++ programs that use SDL2 (and SDL2_image / SDL2_mixer / SDL2_ttf), raylib, or plain
  stdin/stdout.
- Build systems: a short list of source files compiled directly (the reliable path), or CMake / Make
  projects you adapt into a source list.

Anything else gets an honest "not supported yet" with the reason. Do not pretend otherwise.

## The loop

1. `inspect <github-url|path>` first. Read the portability verdict, the libraries, the entry point, and
   each blocker with its usual fix. If it says `not-supported`, tell the user plainly and stop.
2. `toolchain`. Confirm a local `emcc` or a running Docker daemon. If neither, relay the install hint.
3. Decide the source changes. The common ones:
   - Blocking main loop: either rewrite the loop to call `emscripten_set_main_loop`, or pass
     `asyncify: true` to `build`. Prefer `emscripten_set_main_loop` for games; it is lighter.
   - Filesystem writes that must persist: switch to IDBFS and call `FS.syncfs`.
   Make the edits in the inspected source directory, then save a unified diff as a patch file so the
   change is recorded in the report.
4. `build` with the detected `appKind`, the `libs` list from inspect, the `sources` to compile, any
   `preload` directories for assets, and `asyncify` if you did not rewrite the loop.
5. `package` with `mode: "canvas"` for SDL2/raylib or `mode: "stdio"` for terminal programs.
6. `verify`. For canvas apps, read `fps`, `canvasNonBlank`, and `consoleErrors`, and pass scripted keys.
   For stdio apps, pass `inputs` and a `native` binary so native and browser outputs are compared.
7. `report` with a title, the patch file, a short list of changes and why, and honest limits.

## Rules

- Every claim you make to the user must be backed by evidence in the workspace. Do not invent fps,
  frame counts, or "it works". Quote the verify output.
- One workspace directory per port. Pass the same `workspace` to build, package, verify, and report.
- Keep the program's LICENSE file and pass it to `package` so it ships in the site.
- If a step fails, read the recorded command output in the workspace `evidence/` folder and fix the
  real cause. Do not loosen the check to make it pass.

## Example (SDL2 game)

```
inspect   https://github.com/example/tiny-sdl-game
toolchain
# (edit source: replace the while(running) loop with emscripten_set_main_loop)
build     workspace=/tmp/port source=/tmp/clone sources=[main.c] appKind=sdl2 libs=[SDL2] preload=[assets]
package   workspace=/tmp/port mode=canvas title="Tiny Game"
verify    workspace=/tmp/port mode=canvas seconds=3
report    workspace=/tmp/port title="Tiny Game" patch=/tmp/port/changes.patch
```
