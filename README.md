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

## Agent setup (Claude Code)

Three pieces: the fish function, the hook script, and the Claude Code hook config.

### 1. Install the fish function

```bash
cp fudo.fish ~/.config/fish/functions/fudo.fish
```

This gives you the `fudo` command. It calls the Fudo app API at `localhost:17321/screenshot` when the app is running, or falls back to a plain `xcrun simctl` screenshot.

### 2. Install the hook script

```bash
# Copy to wherever you keep your scripts
cp fudo-hook.sh ~/path/to/fudo-hook.sh
chmod +x ~/path/to/fudo-hook.sh
```

The hook script listens for prompts starting with `fudo`, runs the fish function, and injects the annotated screenshot + view context into Claude Code's conversation as `additionalContext`.

### 3. Add the hook to Claude Code

Add this to your `~/.claude/settings.json` under `"hooks"` → `"UserPromptSubmit"`:

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "/path/to/fudo-hook.sh",
      "timeout": 15,
      "statusMessage": "Fudo: capturing screenshot..."
    }
  ]
}
```

### Usage

With Fudo running and overlaying your simulator, just type in Claude Code:

```
fudo fix this area
fudo what's wrong with this screen?
fudo the spacing here looks off
```

Claude Code automatically receives:
- The annotated screenshot (with your drawings, boxes, and text)
- The current view name from the simulator
- The relevant source files for that view

No copy-paste. No drag-and-drop. Draw on it, ask about it.

### API

```bash
curl http://localhost:17321/health        # is fudo running?
curl http://localhost:17321/screenshot    # capture annotated screenshot
```

Response includes screenshot path, simulator screenshot, current view name, and relevant source files.

### The workflow

1. Open Fudo + iOS Simulator
2. Draw on the screen — circle a bug, box an area, scribble "ugly"
3. Type `fudo fix this` in Claude Code
4. Claude sees exactly what you see — annotations and all
5. Claude fixes it
6. Both pretend it was hard

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

---

## Share

> me building iOS apps in 2025:
>
> step 1: open simulator
> step 2: see bug
> step 3: draw angry red circle around bug
> step 4: write "pls fix" on screen
> step 5: coding agent reads my crayon annotations and actually fixes it
>
> i automated the "pointing at the screen" part of iOS development.
> you're welcome.
>
> introducing Fudo — a transparent overlay for your iOS Simulator.
> draw on it. screenshot it. hand it to your coding agent.
>
> your agent finally understands "that thing right there" because
> you literally drew a red box around it like a kindergartner.
>
> the future of human-agent communication is MS Paint energy.
>
> open source, 5MB, native macOS, MIT licensed.
>
> https://github.com/embit087/Fudo

## License

MIT

## Author

jwu322
