# sdl-tetris ported to the browser

A Tetris clone in C using SDL2 and SDL2_ttf.

- Upstream: https://github.com/olzhasar/sdl-tetris
- Commit: `428d99d52a1de2448c7442d2655fae56aa6e9e96`
- License: MIT (kept in `site/LICENSE`)

## Result

`verify` opened the packaged site in headless Chrome and recorded: no console errors, the canvas drew
non-blank frames, and 172 frames over 3003 ms (57.3 fps). The score and level text confirm SDL2_ttf
is loading the preloaded font. See `report.md`, `report.json`, and `screenshots/`.

![end frame](screenshots/canvas-end.png)

No source changes were needed: the upstream code already guards its main loop with `__EMSCRIPTEN__`
and calls `emscripten_set_main_loop`.

## Reproduce

```
browser-port inspect https://github.com/olzhasar/sdl-tetris --dest /tmp/tetris-src --save /tmp/tetris
browser-port build /tmp/tetris \
  --source /tmp/tetris-src \
  --sources src/game.c src/graphics.c src/input.c src/main.c \
  --app-kind sdl2 --libs SDL2 SDL2_ttf \
  --preload-map "src/assets/font.ttf@font.ttf"
browser-port package /tmp/tetris --title "SDL Tetris" --mode canvas --license /tmp/tetris-src/LICENSE
browser-port verify /tmp/tetris --mode canvas --seconds 3
browser-port report /tmp/tetris --title "SDL Tetris ported to the browser"
```

## Run it

```
browser-port serve examples/sdl-tetris/site
```
