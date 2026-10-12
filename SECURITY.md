# Security

## What runs and what leaves the machine

`browser-port` runs locally. It clones the repository you point it at, runs Emscripten to compile it,
serves the result on a local port, and drives a local headless browser. The only outbound traffic is
the repository clone and, if you use the Docker path, the `emscripten/emsdk` image pull. The tool does
not call an LLM and sends no telemetry.

## Handling untrusted repositories

`inspect` clones and reads source. `build` compiles that source and runs its build commands through
Emscripten. Treat any cloned repository as untrusted code: build it in a throwaway directory, and do
not run `build` on a repository you would not compile locally. `verify` runs the compiled program in a
sandboxed headless browser, not natively.

## Config changes

`setup` writes only to `~/.claude.json`, `~/.codex/config.toml`, and `~/.cursor/mcp.json`. It makes a
`.bak` copy of any file it changes, is a dry run unless you pass `--yes`, and is idempotent.

## Reporting a vulnerability

Open a private report through the repository's security advisories, or email the maintainer. Please do
not open a public issue for a security problem until it has been addressed.
