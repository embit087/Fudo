# Fudo (筆道)

**Draw on your simulator. Show it to your agent. Bug fixed.**

That's it. That's the app.

> You: *circles the bug in red, writes "ugly lol"*
> Your agent: *actually fixes it*

![Fudo in action](screenshot-demo.png)

## Why

Because telling your coding agent "the button on the top right looks weird" is like giving directions over the phone. Just draw on it.

Fudo is a transparent overlay you slap on top of your iOS Simulator. Draw bounding boxes. Scribble "fix this". Screenshot. Your agent sees exactly what you see — annotations and all.

The human points. The agent codes. Nobody wastes 20 minutes typing what a red circle could say.

## Features

- Transparent canvas overlay on top of the simulator
- Bounding boxes (dotted/dashed/solid) + freehand drawing + text
- `Cmd+M` to collapse and interact with the simulator
- Screenshot captures everything — your annotations + the simulator
- Local API at `localhost:17321` — agents can trigger screenshots
- Keyboard shortcuts: `S`elect, `B`ox, `P`en, `T`ext

## Install

```bash
git clone https://github.com/embit087/Fudo.git
cd Fudo
npm install
npm run tauri build
cp -R "src-tauri/target/release/bundle/macos/Fudo.app" /Applications/
```

Needs macOS, [Rust](https://rustup.rs/), Node 18+.

## Agent setup

### Hook (recommended)

Drop [`fudo.fish`](https://github.com/embit087/Fudo/blob/main/fudo.fish) into `~/.config/fish/functions/`. Then just type:

```
fudo what's wrong with this screen?
```

Your agent gets the annotated screenshot + current view + source files. No copy-paste. No drag-and-drop. Just vibes.

### API

```bash
curl http://localhost:17321/health        # is fudo running?
curl http://localhost:17321/screenshot    # capture annotated screenshot
```

Response includes screenshot path, simulator screenshot, current view name, and relevant source files.

### The workflow

1. Human draws on the simulator
2. Human says `fudo fix this`
3. Agent sees exactly what the human sees
4. Agent fixes it
5. Both pretend it was hard

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `S` | Select |
| `B` | Bounding box |
| `P` | Pen |
| `T` | Text |
| `Cmd+M` | Collapse/expand frame |
| `Cmd+Z` | Undo |
| `Delete` | Remove selected |

## Tech

Tauri v2 + React + TypeScript. 5MB. Native macOS. No bloat.

## License

MIT

## Author

jwu322
