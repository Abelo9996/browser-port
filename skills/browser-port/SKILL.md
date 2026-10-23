---
name: browser-port
description: Turn an open-source C or C++ SDL or raylib game (or a plain stdin/stdout program) into a link anyone can play, in one command, or get an honest reason why not. Use when the user wants to run a native game on the web, make a desktop C/C++ game playable in a browser, or share a C/C++ tool as a web page. Drives Emscripten, a headless browser, and a static site builder; records evidence at every step.
---

# browser-port

You give the user the power to port a C/C++ game or app to the browser. The `browser-port` tools do
the reliable work (Emscripten, packaging, headless-browser verification) and record evidence. The
tools never call a model.

## What is supported

- C and C++ programs that use SDL2 (and SDL2_image / SDL2_mixer / SDL2_ttf), raylib, or plain
  stdin/stdout.
- Not supported, and reported honestly with the reason: Qt, GTK, wxWidgets, native X11/GLX/WGL/Cocoa
  windowing, Win32 GUI, raw sockets, and threads. OpenGL used through SDL2 or raylib is fine.

## The fast path: one call

Prefer `port <github-url|path>`. It inspects, derives the sources (from a CMake `add_executable` or
the file with `main` plus its local includes), the libraries, the app kind, and the asset preload map,
then builds, packages, and verifies in headless Chrome in a single step. On a build failure it reads
the error and applies a known fix in order (enable an SDL port library, compile all project sources,
force-include `<emscripten.h>`, downgrade an implicit-declaration error, grow the stack, or wrap a
blocking loop in ASYNCIFY), retrying a bounded number of times and recording each attempt.

```
port https://github.com/owner/game
```

Read the result: `ok`, `fps`, the `siteDir`, the `screenshot`, and the `attempts` ladder. If
`supported` is false, relay the `blocker` to the user plainly and stop. If it built but did not verify,
read `blocker` and the `evidence/` folder for the real cause. Serve the `siteDir` with the `serve` tool
to give the user a link.

Drop to the individual tools below only when `port` cannot finish on its own and you need to hand-edit
the source between steps (for example, refactoring a blocking `while` loop into
`emscripten_set_main_loop`, which `port` will not do for you).

## The manual loop

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
