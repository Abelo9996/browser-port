# Contributing

Thanks for your interest. This project values small, reviewable changes with evidence.

## Setup

```
npm install
npm run build
npm test
```

Node 20 or newer is required. For the integration paths you also need Emscripten (`brew install
emscripten` on macOS, or the `emscripten/emsdk` Docker image) and a Playwright browser
(`npx playwright install chromium`).

## Checks before a pull request

```
npm run lint
npm run typecheck
npm test
```

Unit tests must stay offline and fast. They never use Docker or the network. Tests that need
Emscripten or a browser are integration tests and are skipped when those tools are absent. Setup tests
use a temporary HOME and never touch real config files.

## Style

- Plain, specific sentences. No hype words. Do not use em dashes or en dashes.
- Match the surrounding code. Keep functions pure where it helps testing (see `detect` in
  `src/ops/inspect.ts`).
- Every operation records the commands it runs. Keep that true for new operations.

## Scope

The MVP targets C and C++ programs that use SDL2, raylib, or plain stdio. If you add support for
another toolkit or language, include a real worked example in `examples/` with its evidence bundle.
