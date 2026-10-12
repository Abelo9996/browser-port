# hexyl: not supported yet

An honest failure case. `hexyl` is a command line hex viewer.

- Upstream: https://github.com/sharkdp/hexyl
- Commit: `6ecc29b9c8c84d08a7e860f7f69c22b113b480ea`

## Result

`inspect` reported `not-supported` with the blocker `no-c-cpp`: no C or C++ source files were found.
hexyl is written in Rust. This MVP ports C and C++ programs that use SDL2, raylib, or plain stdio, so
hexyl is out of scope. See `report.md` and `report.json`.

## Reproduce

```
browser-port inspect https://github.com/sharkdp/hexyl
```
