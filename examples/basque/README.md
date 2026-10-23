# Basque ported to the browser

Basque is a cross-platform top-down 2D game engine written in C on SDL2 (with SDL2_image, SDL2_mixer,
and SDL2_ttf). It loads a tiled map and renders it.

- Upstream: https://github.com/ryanpcmcquen/basque
- Commit: `da59ea94202f499e2b8bd95b69d59610ff0c7002`
- License: MPL-2.0 (kept in `site/LICENSE`)

## Result

Produced in one command with no manual flags. `port` derived the app kind (SDL2) and all four
libraries from the includes, added `-Isource`, and preloaded the `assets/` directory. The build
succeeded on the first try. `verify` opened the site in headless Chrome and recorded 318 frames over
about 6.3 s (50.1 fps) with no fatal errors.

The program logs one non-fatal line, `ERROR: IMG_Init: JPEG images are not supported`, and keeps
running (it uses PNG maps); `port` reports that but does not treat it as a failure. The canvas
screenshot reads blank because a WebGL drawing buffer is cleared after compositing and cannot be read
back in headless Chrome; the 318 advancing frames are the liveness evidence. See `report.md`,
`report.json`, and `screenshots/`.

## Reproduce

```
browser-port port https://github.com/ryanpcmcquen/basque --out /tmp/basque
```

## Run it

```
browser-port serve examples/basque/site
```
