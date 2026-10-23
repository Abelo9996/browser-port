# pong ported to the browser

A Pong clone in C++ using SDL2 and SDL2_ttf. It busy-waits on its title and between-point screens with
`while (!is_running) { while (SDL_PollEvent(&e)) ... }`, which never yields in a browser as written.
The repo also vendors a full copy of SDL2 under `Lib/`.

- Upstream: https://github.com/ucx15/pong
- Commit: `7f9b91a3af821f23f6e7c091238b0f6cb2e1787f`
- License: MIT (kept in `site/LICENSE`)

## Result

Produced in one command with no manual flags. `port` ignored the vendored `Lib/SDL2` copy (so its
X11-referencing headers did not trip a false refusal and its sources were not compiled), derived the
project sources, and built against Emscripten's own SDL2. The first verify showed a non-yielding loop,
so `port` relinked with the **build-time yield shim** (`-sASYNCIFY` plus wasm-ld `--wrap` on
`SDL_PollEvent`/`SDL_RenderPresent`/`SDL_GL_SwapWindow`/`SDL_UpdateWindowSurface`, each calling
`emscripten_sleep(0)`). **The game's source was not modified.**

On the retry, `verify` pressed Space to start the match and recorded that the canvas content changed:
playable. The loop yields through `setTimeout`, so there is no fps figure; the canvas motion is the
liveness evidence. See `report.md`, `report.json`, and `screenshots/`.

## Reproduce

```
browser-port port https://github.com/ucx15/pong --out /tmp/pong
```

## Run it

```
browser-port serve examples/pong/site
```

Press Space to start.
