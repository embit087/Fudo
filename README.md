# Fudo (筆道)

**The annotation overlay your iOS simulator didn't ask for, but definitely deserves.**

Draw bounding boxes, scribble notes, and screenshot your simulator — all without touching Figma, Sketch, or that one coworker's whiteboard.

> "I could just use the built-in screenshot tool" — someone who hasn't tried Fudo yet

## What it does

Fudo is a transparent overlay that sits on top of your iOS Simulator. Draw on it. Annotate it. Screenshot it. Ship it in Slack. Become the person who actually communicates visually.

- Transparent canvas overlay — position it over the simulator
- Bounding boxes with dotted/dashed/solid styles
- Freehand drawing and text annotations
- Color picker with presets + custom colors
- Screenshot captures everything (simulator + your annotations)
- CLI API at `localhost:17321` for automation
- `Cmd+M` to collapse the frame and interact with the simulator
- Keyboard shortcuts: `S`elect, `B`ox, `P`en, `T`ext

## Install

```bash
# Build from source
npm install
npm run tauri build

# Install
cp -R "src-tauri/target/release/bundle/macos/Fudo.app" /Applications/
```

## CLI

```bash
# Check if Fudo is running
curl http://localhost:17321/health

# Take a screenshot
curl http://localhost:17321/screenshot

# Take a screenshot with custom path
curl "http://localhost:17321/screenshot?path=/tmp/my-annotation.png"
```

## Tech

Tauri v2 + React + TypeScript. Runs native on macOS.

## License

MIT — do whatever you want with it.

## Author

jwu322
