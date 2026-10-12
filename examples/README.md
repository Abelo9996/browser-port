# Examples

Three real ports, produced end to end on a Mac with `browser-port`. Each folder keeps the evidence
bundle (`report.md`, `report.json`), the screenshots from headless Chrome, and the runnable static
site. The upstream license is kept in every site folder.

| Example | Source | Kind | Result |
| --- | --- | --- | --- |
| [sdl-tetris](sdl-tetris) | olzhasar/sdl-tetris (C, SDL2 + SDL2_ttf) | canvas game | pass, 57.3 fps |
| [brainheck](brainheck) | daniilsjb/brainheck (C, stdio) | terminal program | pass, native output matched |
| [not-supported/hexyl](not-supported/hexyl) | sharkdp/hexyl (Rust) | not supported yet | reported honestly |

To open a site locally:

```
browser-port serve examples/sdl-tetris/site
```

Then open the printed URL.
