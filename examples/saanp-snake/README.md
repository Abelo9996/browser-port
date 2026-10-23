# saanp.vi ported to the browser

A snake game in C using SDL2 and SDL2_ttf. The main loop is a plain desktop
`while (!quit)` that busy-waits on its title screen, so it does not run in a browser as written.

- Upstream: https://github.com/iambasantarai/saanp.vi
- Commit: `2674a30217c7e865f2c44b541c28658b522b84fb`
- License: MIT (kept in `site/LICENSE`)

## Result

Produced in one command with no manual flags. The first build and verify showed the signature of a
non-yielding loop (the runtime started but the renderer never responded). `port` then relinked the
same binary with a **build-time yield shim**: `-sASYNCIFY` plus wasm-ld `--wrap` on `SDL_PollEvent`,
`SDL_RenderPresent`, `SDL_GL_SwapWindow`, and `SDL_UpdateWindowSurface`. The wrappers call
`emscripten_sleep(0)` after each present and when the event queue is empty, so the loop returns
control to the browser every frame. **The game's source was not modified.**

On the retry, `verify` pressed Enter to start the snake and recorded that the canvas content changed
across the observation window: playable. Because the loop yields through `setTimeout` rather than
`requestAnimationFrame`, there is no fps figure; the canvas motion is the liveness evidence. See
`report.md`, `report.json`, and `screenshots/`.

## Reproduce

```
browser-port port https://github.com/iambasantarai/saanp.vi --out /tmp/saanp
```

## Run it

```
browser-port serve examples/saanp-snake/site
```

Press Enter (or `i`) to start; `h` `j` `k` `l` to steer.
