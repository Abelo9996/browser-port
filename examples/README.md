# Examples

Real ports, produced end to end on a Mac with `browser-port`. Each folder keeps the evidence bundle
(`report.md`, `report.json`), the screenshots from headless Chrome, and the runnable static site. The
upstream license is kept in every site folder.

The `packt-shmup` and `basque` rows were produced by the one-command `browser-port port <url>`: it
inspected, derived the sources, libraries, and asset preloads, built, packaged, and verified in a
single step, with no manual flags. The `sdl-tetris` and `brainheck` rows predate `port` and show the
individual steps.

| Example | Source | Kind | Result |
| --- | --- | --- | --- |
| [packt-shmup](packt-shmup) | PacktPublishing/Hands-On-Game-Development-with-WebAssembly, `Chapter07` (C++, SDL2 + SDL2_image) | canvas game | pass, 60 fps, one command |
| [basque](basque) | ryanpcmcquen/basque (C, SDL2 + image/mixer/ttf) | canvas engine | pass, 50.1 fps, one command |
| [sdl-tetris](sdl-tetris) | olzhasar/sdl-tetris (C, SDL2 + SDL2_ttf) | canvas game | pass, 57.3 fps |
| [brainheck](brainheck) | daniilsjb/brainheck (C, stdio) | terminal program | pass, native output matched |
| [not-supported/hexyl](not-supported/hexyl) | sharkdp/hexyl (Rust) | not supported yet | reported honestly |

To open a site locally:

```
browser-port serve examples/packt-shmup/site
```

Then open the printed URL.
