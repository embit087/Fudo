import { useState, useRef, useCallback, useEffect } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  MousePointer2,
  Square,
  Pencil,
  Type,
  Trash2,
  Undo2,
  Eraser,
  Camera,
  X,
  Palette,
  Minimize2,
  Maximize2,
} from "lucide-react";
import "./App.css";

type Tool = "select" | "rect" | "draw" | "text";

interface Point { x: number; y: number }

type LineStyle = "dotted" | "dashed" | "solid";

const LINE_STYLES: { style: LineStyle; label: string; dash: number[] }[] = [
  { style: "dotted", label: "Dotted", dash: [3, 4] },
  { style: "dashed", label: "Dashed", dash: [8, 6] },
  { style: "solid", label: "Solid", dash: [] },
];

interface Shape {
  id: string;
  type: "rect" | "draw" | "text";
  color: string;
  strokeWidth: number;
  lineStyle: LineStyle;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Point[];
  text?: string;
}

type Handle = "nw" | "ne" | "sw" | "se";

interface DragState {
  mode: "none" | "drawing" | "moving" | "resizing";
  startX: number;
  startY: number;
  snapshot?: Shape;
  handle?: Handle;
}

const COLORS = ["#FF3B30", "#FFCC00", "#34C759", "#007AFF"];
const HANDLE_SIZE = 6;
const HANDLE_HIT = 10;
const ICON = { size: 15, strokeWidth: 2 };

let idCounter = 0;
function genId() { return `s${++idCounter}`; }

function normalizeRect(s: Shape) {
  const w = s.width ?? 0, h = s.height ?? 0;
  return { x: w < 0 ? s.x + w : s.x, y: h < 0 ? s.y + h : s.y, w: Math.abs(w), h: Math.abs(h) };
}

function getHandlePositions(s: Shape) {
  if (s.type !== "rect") return [];
  const { x, y, w, h } = normalizeRect(s);
  return [
    { handle: "nw" as Handle, x, y },
    { handle: "ne" as Handle, x: x + w, y },
    { handle: "sw" as Handle, x, y: y + h },
    { handle: "se" as Handle, x: x + w, y: y + h },
  ];
}

function hitHandle(s: Shape, mx: number, my: number): Handle | null {
  for (const h of getHandlePositions(s))
    if (Math.abs(mx - h.x) <= HANDLE_HIT && Math.abs(my - h.y) <= HANDLE_HIT) return h.handle;
  return null;
}

function hitShape(s: Shape, mx: number, my: number): boolean {
  if (s.type === "rect") {
    const { x, y, w, h } = normalizeRect(s);
    const m = 5;
    return mx >= x - m && mx <= x + w + m && my >= y - m && my <= y + h + m;
  }
  if (s.type === "draw" && s.points)
    return s.points.some((p) => Math.hypot(p.x - mx, p.y - my) < 10);
  if (s.type === "text" && s.text) {
    const tw = s.text.length * 9 + 10;
    return mx >= s.x - 5 && mx <= s.x + tw && my >= s.y - 22 && my <= s.y + 6;
  }
  return false;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState("#FF3B30");
  const [lineStyle, setLineStyle] = useState<LineStyle>("dotted");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [textInput, setTextInput] = useState({ x: 0, y: 0, visible: false });
  const [textValue, setTextValue] = useState("");
  const [flash, setFlash] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [screenshotInfo, setScreenshotInfo] = useState<{
    path: string;
    src: string;
    simScreenshot?: string;
    view?: string;
    files?: string[];
  } | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 300, height: 450 });
  const frameResizing = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const dragState = useRef<DragState>({ mode: "none", startX: 0, startY: 0 });
  const textJustOpened = useRef(false);
  const savedSize = useRef<{ width: number; height: number } | null>(null);
  const clipboard = useRef<Shape | null>(null);

  // --- Render ---
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const all = currentShape ? [...shapes, currentShape] : shapes;
    for (const shape of all) {
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (shape.type === "rect") {
        const { x, y, w, h } = normalizeRect(shape);
        const dashDef = LINE_STYLES.find((ls) => ls.style === shape.lineStyle);
        ctx.setLineDash(dashDef ? dashDef.dash : [3, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      } else if (shape.type === "draw" && shape.points) {
        const dashDef = LINE_STYLES.find((ls) => ls.style === shape.lineStyle);
        ctx.setLineDash(dashDef ? dashDef.dash : []);
        ctx.beginPath();
        shape.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (shape.type === "text" && shape.text) {
        ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 3;
        ctx.fillText(shape.text, shape.x, shape.y);
      }

      if (shape.id === selectedId) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#00BFFF";
        ctx.lineWidth = 1.5;
        if (shape.type === "rect") {
          const { x, y, w, h } = normalizeRect(shape);
          ctx.strokeRect(x - 3, y - 3, w + 6, h + 6);
        } else if (shape.type === "draw" && shape.points?.length) {
          let [mnX, mnY, mxX, mxY] = [Infinity, Infinity, -Infinity, -Infinity];
          for (const p of shape.points) { mnX = Math.min(mnX, p.x); mnY = Math.min(mnY, p.y); mxX = Math.max(mxX, p.x); mxY = Math.max(mxY, p.y); }
          ctx.strokeRect(mnX - 5, mnY - 5, mxX - mnX + 10, mxY - mnY + 10);
        } else if (shape.type === "text" && shape.text) {
          const tw = shape.text.length * 9 + 10;
          ctx.strokeRect(shape.x - 5, shape.y - 20, tw, 28);
        }
        ctx.setLineDash([]);
        if (shape.type === "rect") {
          for (const hp of getHandlePositions(shape)) {
            ctx.fillStyle = "#FFF";
            ctx.strokeStyle = "#00BFFF";
            ctx.lineWidth = 1.5;
            ctx.fillRect(hp.x - HANDLE_SIZE, hp.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
            ctx.strokeRect(hp.x - HANDLE_SIZE, hp.y - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2);
          }
        }
      }
      ctx.restore();
    }
    ctx.restore();
  }, [shapes, currentShape, selectedId]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.parentElement!.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      redraw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [redraw]);

  // Track window focus
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => { window.removeEventListener("focus", onFocus); window.removeEventListener("blur", onBlur); };
  }, []);

  // Focus text input when it becomes visible
  useEffect(() => {
    if (textInput.visible && textRef.current) {
      textJustOpened.current = true;
      setTimeout(() => {
        textRef.current?.focus();
        textJustOpened.current = false;
      }, 50);
    }
  }, [textInput.visible]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd+M always works, even during text input or when collapsed
      if ((e.metaKey || e.ctrlKey) && e.key === "m") { e.preventDefault(); handleCollapse(); return; }
      if (textInput.visible) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        setShapes((p) => p.filter((s) => s.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "Escape") { setSelectedId(null); setTextInput((t) => ({ ...t, visible: false })); setColorOpen(false); }
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); setShapes((p) => p.slice(0, -1)); setSelectedId(null); }
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedId) {
        e.preventDefault();
        const sel = shapes.find((s) => s.id === selectedId);
        if (sel) clipboard.current = { ...sel, points: sel.points ? [...sel.points] : undefined };
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboard.current) {
        e.preventDefault();
        const src = clipboard.current;
        const newId = genId();
        const offset = 20;
        const pasted: Shape = { ...src, id: newId, x: src.x + offset, y: src.y + offset, points: src.points ? src.points.map((p) => ({ x: p.x + offset, y: p.y + offset })) : undefined };
        setShapes((p) => [...p, pasted]);
        setSelectedId(newId);
      }
      if (!e.metaKey && !e.ctrlKey) {
        const clearState = () => { setCurrentShape(null); setSelectedId(null); setTextInput((t) => ({ ...t, visible: false })); setTextValue(""); setColorOpen(false); };
        if (e.key === "s") { setTool("select"); clearState(); }
        if (e.key === "b") setTool((prev) => { if (prev === "rect") { clearState(); return "select"; } return "rect"; });
        if (e.key === "p") setTool((prev) => { if (prev === "draw") { clearState(); return "select"; } return "draw"; });
        if (e.key === "t") setTool((prev) => { if (prev === "text") { clearState(); return "select"; } return "text"; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, textInput.visible, collapsed]);

  const handleFrameResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    frameResizing.current = { startX: e.clientX, startY: e.clientY, startW: frameSize.width, startH: frameSize.height };
    const onMove = async (ev: MouseEvent) => {
      if (!frameResizing.current) return;
      const { startX, startY, startW, startH } = frameResizing.current;
      const newW = Math.max(120, startW + ev.clientX - startX);
      const newH = Math.max(80, startH + ev.clientY - startY);
      setFrameSize({ width: newW, height: newH });
      // Auto-adjust window height to fit frame
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      const win = getCurrentWindow();
      const winSize = await win.innerSize();
      const scale = await win.scaleFactor();
      const winW = Math.round(winSize.width / scale);
      const neededH = newH + 56; // panel + margins
      await win.setSize(new LogicalSize(Math.max(winW, newW + 16), neededH));
    };
    const onUp = () => {
      frameResizing.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const getPos = (e: React.MouseEvent): Point => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e);

    if (tool === "text") {
      // If text input is already open, submit it first
      if (textInput.visible && textValue.trim()) {
        setShapes((p) => [...p, { id: genId(), type: "text", color, strokeWidth: 1, lineStyle: "solid", x: textInput.x, y: textInput.y, text: textValue }]);
      }
      setTextInput({ x: pos.x, y: pos.y + 8, visible: true });
      setTextValue("");
      return;
    }

    if (tool === "select") {
      if (selectedId) {
        const sel = shapes.find((s) => s.id === selectedId);
        if (sel) { const h = hitHandle(sel, pos.x, pos.y); if (h) { dragState.current = { mode: "resizing", startX: pos.x, startY: pos.y, snapshot: { ...sel }, handle: h }; return; } }
        // Double-click on selected text to edit
        if (sel && sel.type === "text" && e.detail === 2 && hitShape(sel, pos.x, pos.y)) {
          setTextInput({ x: sel.x, y: sel.y, visible: true });
          setTextValue(sel.text || "");
          setShapes((p) => p.filter((s) => s.id !== selectedId));
          setSelectedId(null);
          return;
        }
      }
      for (let i = shapes.length - 1; i >= 0; i--) {
        if (hitShape(shapes[i], pos.x, pos.y)) {
          setSelectedId(shapes[i].id);
          dragState.current = { mode: "moving", startX: pos.x, startY: pos.y, snapshot: { ...shapes[i], points: shapes[i].points ? [...shapes[i].points!] : undefined } };
          return;
        }
      }
      setSelectedId(null);
      return;
    }

    // In drawing modes, check if clicking on an existing shape to select it
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitShape(shapes[i], pos.x, pos.y)) {
        setSelectedId(shapes[i].id);
        setTool("select");
        dragState.current = { mode: "moving", startX: pos.x, startY: pos.y, snapshot: { ...shapes[i], points: shapes[i].points ? [...shapes[i].points!] : undefined } };
        return;
      }
    }

    const id = genId();
    if (tool === "rect") setCurrentShape({ id, type: "rect", color, strokeWidth: 2.5, lineStyle, x: pos.x, y: pos.y, width: 0, height: 0 });
    else if (tool === "draw") setCurrentShape({ id, type: "draw", color, strokeWidth: 3, lineStyle, x: pos.x, y: pos.y, points: [pos] });
    dragState.current = { mode: "drawing", startX: pos.x, startY: pos.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getPos(e);
    const ds = dragState.current;
    if (ds.mode === "drawing" && currentShape) {
      if (currentShape.type === "rect") setCurrentShape({ ...currentShape, width: pos.x - currentShape.x, height: pos.y - currentShape.y });
      else if (currentShape.type === "draw") setCurrentShape({ ...currentShape, points: [...(currentShape.points || []), pos] });
    }
    if (ds.mode === "moving" && ds.snapshot && selectedId) {
      const dx = pos.x - ds.startX, dy = pos.y - ds.startY;
      setShapes((prev) => prev.map((s) => {
        if (s.id !== selectedId) return s;
        const u: Shape = { ...s, x: ds.snapshot!.x + dx, y: ds.snapshot!.y + dy };
        if (s.type === "draw" && ds.snapshot!.points) u.points = ds.snapshot!.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        return u;
      }));
    }
    if (ds.mode === "resizing" && ds.snapshot && ds.handle && selectedId) {
      const { x: sx, y: sy, width: sw = 0, height: sh = 0 } = ds.snapshot;
      const ddx = pos.x - ds.startX, ddy = pos.y - ds.startY;
      setShapes((prev) => prev.map((s) => {
        if (s.id !== selectedId) return s;
        let [nx, ny, nw, nh] = [sx, sy, sw, sh];
        switch (ds.handle) {
          case "se": nw = sw + ddx; nh = sh + ddy; break;
          case "nw": nx = sx + ddx; ny = sy + ddy; nw = sw - ddx; nh = sh - ddy; break;
          case "ne": ny = sy + ddy; nw = sw + ddx; nh = sh - ddy; break;
          case "sw": nx = sx + ddx; nw = sw - ddx; nh = sh + ddy; break;
        }
        return { ...s, x: nx, y: ny, width: nw, height: nh };
      }));
    }
  };

  const handleMouseUp = () => {
    if (dragState.current.mode === "drawing" && currentShape) {
      if (currentShape.type === "rect") {
        if (Math.abs(currentShape.width ?? 0) > 3 || Math.abs(currentShape.height ?? 0) > 3)
          setShapes((p) => [...p, currentShape]);
      } else setShapes((p) => [...p, currentShape]);
      if (currentShape.type === "rect") setTool("select");
      setCurrentShape(null);
    }
    dragState.current = { mode: "none", startX: 0, startY: 0 };
  };

  const handleTextSubmit = () => {
    if (textValue.trim()) {
      setShapes((p) => [...p, { id: genId(), type: "text", color, strokeWidth: 1, lineStyle: "solid", x: textInput.x, y: textInput.y, text: textValue }]);
    }
    setTextInput((t) => ({ ...t, visible: false }));
    setTextValue("");
    setTool("select");
  };

  const handleTextBlur = () => {
    // Guard against immediate blur when input just opened
    if (textJustOpened.current) return;
    handleTextSubmit();
  };

  const handleScreenshot = async () => {
    const prev = selectedId;
    setSelectedId(null);
    await new Promise((r) => setTimeout(r, 60));
    try {
      const result = await invoke<{
        path: string;
        sim: { sim_screenshot: string | null; view: string | null; files: string[] };
      }>("take_screenshot", { path: null });
      setFlash(true);
      setTimeout(() => setFlash(false), 200);
      const src = convertFileSrc(result.path);
      setScreenshotInfo({
        path: result.path,
        src,
        simScreenshot: result.sim.sim_screenshot ? convertFileSrc(result.sim.sim_screenshot) : undefined,
        view: result.sim.view ?? undefined,
        files: result.sim.files.length > 0 ? result.sim.files : undefined,
      });
      setTimeout(() => setScreenshotInfo(null), 8000);
    } catch (e) { console.error("Screenshot failed:", e); }
    setSelectedId(prev);
  };

  const handleColorChange = (c: string) => {
    setColor(c);
    if (selectedId) setShapes((p) => p.map((s) => (s.id === selectedId ? { ...s, color: c } : s)));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1200);
  };

  const handleCollapse = async () => {
    const { LogicalSize } = await import("@tauri-apps/api/dpi");
    const win = getCurrentWindow();
    const scale = await win.scaleFactor();
    if (!collapsed) {
      // Save current logical size before collapsing
      const size = await win.innerSize();
      savedSize.current = { width: Math.round(size.width / scale), height: Math.round(size.height / scale) };
      await win.setSize(new LogicalSize(savedSize.current.width, 56));
      setCollapsed(true);
      showToast("Frame hidden");
    } else {
      if (savedSize.current) {
        await win.setSize(new LogicalSize(savedSize.current.width, savedSize.current.height));
      }
      setCollapsed(false);
      showToast("Frame visible");
    }
  };
  const handleClose = () => { getCurrentWindow().close(); };

  const cursor = tool === "select" ? "default" : tool === "text" ? "text" : "crosshair";

  return (
    <div className="app">
      {flash && <div className="screenshot-flash" />}
      {toast && !collapsed && <div className="toast">{toast}</div>}
      {screenshotInfo && (
        <div className="screenshot-modal" onClick={() => setScreenshotInfo(null)}>
          <div className="screenshot-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="screenshot-previews">
              <img src={screenshotInfo.src} alt="Annotated screenshot" className="screenshot-preview" />
              {screenshotInfo.simScreenshot && (
                <img src={screenshotInfo.simScreenshot} alt="Simulator screenshot" className="screenshot-preview sim-preview" />
              )}
            </div>
            <div className="screenshot-path">{screenshotInfo.path}</div>
            {screenshotInfo.view && (
              <div className="screenshot-context">
                <span className="context-label">View:</span> {screenshotInfo.view}
              </div>
            )}
            {screenshotInfo.files && screenshotInfo.files.length > 0 && (
              <div className="screenshot-files">
                <span className="context-label">Files:</span>
                {screenshotInfo.files.map((f) => (
                  <div key={f} className="file-entry">{f}</div>
                ))}
              </div>
            )}
            <button className="screenshot-dismiss" onClick={() => setScreenshotInfo(null)}>OK</button>
          </div>
        </div>
      )}

      <div className={`tool-panel ${collapsed ? "panel-collapsed" : ""}`} data-tauri-drag-region>
        <div className="panel-scroll" data-tauri-drag-region>
          <button className="panel-btn close-btn" onClick={handleClose} title={"Close\nQuit the annotation tool"}>
            <X size={12} strokeWidth={2.5} />
          </button>
          <button className="panel-btn" onClick={handleCollapse} title={collapsed ? "Show Frame (⌘M)\nExpand the screenshot frame" : "Hide Frame (⌘M)\nCollapse the screenshot frame"}>
            {collapsed ? <Maximize2 {...ICON} /> : <Minimize2 {...ICON} />}
          </button>

          <span className="panel-sep" />

          <button className={`panel-btn ${tool === "select" ? "active" : ""}`} onClick={() => setTool("select")} title={"Select (S)\nClick to move or resize shapes"}>
            <MousePointer2 {...ICON} />
          </button>
          <button className={`panel-btn ${tool === "rect" ? "active" : ""}`} onClick={() => setTool("rect")} title={"Box (B)\nDraw a bounding box on screen"}>
            <Square {...ICON} />
          </button>
          <button className={`panel-btn ${tool === "draw" ? "active" : ""}`} onClick={() => setTool("draw")} title={"Pen (P)\nFreehand draw on the canvas"}>
            <Pencil {...ICON} />
          </button>
          <button className={`panel-btn ${tool === "text" ? "active" : ""}`} onClick={() => setTool("text")} title={"Text\nClick anywhere to type a note"}>
            <Type {...ICON} />
          </button>

          <span className="panel-sep" />

          {/* Line style toggle */}
          <button className="panel-btn line-style-btn" onClick={() => {
            const idx = LINE_STYLES.findIndex((ls) => ls.style === lineStyle);
            const next = LINE_STYLES[(idx + 1) % LINE_STYLES.length];
            setLineStyle(next.style);
            if (selectedId) setShapes((p) => p.map((s) => s.id === selectedId ? { ...s, lineStyle: next.style } : s));
          }} title={`Style: ${lineStyle}\nCycle through dotted, dashed, solid`}>
            <svg width="18" height="10" viewBox="0 0 18 10">
              {lineStyle === "dotted" && <>
                <circle cx="2" cy="5" r="1.2" fill="currentColor" />
                <circle cx="6" cy="5" r="1.2" fill="currentColor" />
                <circle cx="10" cy="5" r="1.2" fill="currentColor" />
                <circle cx="14" cy="5" r="1.2" fill="currentColor" />
              </>}
              {lineStyle === "dashed" && <>
                <line x1="0" y1="5" x2="5" y2="5" stroke="currentColor" strokeWidth="2" />
                <line x1="8" y1="5" x2="13" y2="5" stroke="currentColor" strokeWidth="2" />
              </>}
              {lineStyle === "solid" && <line x1="0" y1="5" x2="18" y2="5" stroke="currentColor" strokeWidth="2" />}
            </svg>
          </button>

          {/* Color dropdown */}
          <div className="color-dropdown-wrap">
            <button className="panel-btn color-trigger" onClick={() => setColorOpen((o) => !o)}
              title={"Color\nChoose annotation color"}>
              <span className="color-indicator" style={{ backgroundColor: color }} />
            </button>
            {colorOpen && (
              <div className="color-dropdown">
                {COLORS.map((c, i) => {
                  const names = ["Red", "Yellow", "Green", "Blue"];
                  return (
                    <button key={c} className={`color-dot ${color === c ? "active" : ""}`} style={{ backgroundColor: c }}
                      onClick={() => { handleColorChange(c); setColorOpen(false); }}
                      title={`${names[i]}\nUse ${names[i].toLowerCase()} for annotations`} />
                  );
                })}
                <label className="color-picker-wrap" title={"Custom\nPick any color from palette"}>
                  <Palette size={14} strokeWidth={2} color="rgba(255,255,255,0.5)" />
                  <input type="color" className="color-picker-input" value={color}
                    onChange={(e) => { handleColorChange(e.target.value); setColorOpen(false); }} />
                </label>
              </div>
            )}
          </div>

          <span className="panel-sep" />

          {selectedId && (
            <button className="panel-btn delete-btn" onClick={() => { setShapes((p) => p.filter((s) => s.id !== selectedId)); setSelectedId(null); }}
              title={"Delete\nRemove the selected shape"}>
              <Trash2 size={14} strokeWidth={2} />
            </button>
          )}
          <button className="panel-btn" onClick={() => { setShapes((p) => p.slice(0, -1)); setSelectedId(null); }}
            title={"Undo\nRemove the last thing you drew"}>
            <Undo2 {...ICON} />
          </button>
          <button className="panel-btn" onClick={() => { setShapes([]); setCurrentShape(null); setSelectedId(null); }}
            title={"Clear\nWipe all annotations from canvas"}>
            <Eraser {...ICON} />
          </button>

          <span className="panel-sep" />

          <button className="panel-btn snap-btn" onClick={handleScreenshot}
            title={"Snap\nCapture canvas area to Desktop"}>
            <Camera {...ICON} />
          </button>
        </div>
      </div>

      {!collapsed && <div className={`canvas-frame ${focused ? "frame-active" : ""}`} style={{ width: frameSize.width, height: frameSize.height }}>
        <canvas ref={canvasRef} style={{ cursor }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} />
        <div className="frame-resize-handle" onMouseDown={handleFrameResizeStart} />
        {textInput.visible && (
          <input
            ref={textRef}
            className="text-overlay-input"
            style={{ left: textInput.x, top: textInput.y, color }}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit();
              if (e.key === "Escape") { setTextInput((t) => ({ ...t, visible: false })); setTextValue(""); }
            }}
            onBlur={handleTextBlur}
          />
        )}
        {/* Contextual popover near selected shape */}
        {selectedId && (() => {
          const sel = shapes.find((s) => s.id === selectedId);
          if (!sel) return null;
          let px: number, py: number;
          if (sel.type === "rect") {
            const nr = normalizeRect(sel);
            px = nr.x + nr.w / 2;
            py = nr.y - 10;
          } else if (sel.type === "draw" && sel.points?.length) {
            let minY = Infinity, sumX = 0;
            for (const p of sel.points) { minY = Math.min(minY, p.y); sumX += p.x; }
            px = sumX / sel.points.length;
            py = minY - 10;
          } else if (sel.type === "text" && sel.text) {
            const tw = sel.text.length * 9 + 10;
            px = sel.x + tw / 2;
            py = sel.y - 28;
          } else {
            px = sel.x;
            py = sel.y - 28;
          }
          return (
            <div className="shape-popover" style={{ left: px, top: py }}
              onMouseDown={(e) => e.stopPropagation()}>
              {/* Row 1: Colors */}
              <div className="pop-row">
                {COLORS.map((c) => (
                  <button key={c} className={`pop-color ${sel.color === c ? "active" : ""}`} style={{ backgroundColor: c }}
                    onClick={() => handleColorChange(c)} />
                ))}
                <label className="pop-custom-color" title="Custom color">
                  <Palette size={12} strokeWidth={2} color="rgba(255,255,255,0.5)" />
                  <input type="color" className="color-picker-input" value={sel.color}
                    onChange={(e) => handleColorChange(e.target.value)} />
                </label>
              </div>
              {/* Row 2: Style + Delete */}
              <div className="pop-row">
                {(sel.type === "rect" || sel.type === "draw") && (
                  <>
                    {LINE_STYLES.map((ls) => (
                      <button key={ls.style} className={`pop-style ${sel.lineStyle === ls.style ? "active" : ""}`}
                        onClick={() => { setLineStyle(ls.style); setShapes((p) => p.map((s) => s.id === selectedId ? { ...s, lineStyle: ls.style } : s)); }}
                        title={ls.label}>
                        <svg width="16" height="6" viewBox="0 0 16 6">
                          {ls.style === "dotted" && <><circle cx="1" cy="3" r="1.2" fill="rgba(255,255,255,0.8)"/><circle cx="5.5" cy="3" r="1.2" fill="rgba(255,255,255,0.8)"/><circle cx="10" cy="3" r="1.2" fill="rgba(255,255,255,0.8)"/><circle cx="14.5" cy="3" r="1.2" fill="rgba(255,255,255,0.8)"/></>}
                          {ls.style === "dashed" && <><line x1="0" y1="3" x2="5" y2="3" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/><line x1="8" y1="3" x2="13" y2="3" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/></>}
                          {ls.style === "solid" && <line x1="0" y1="3" x2="16" y2="3" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>}
                        </svg>
                      </button>
                    ))}
                    <span className="pop-sep" />
                  </>
                )}
                <button className="pop-delete" onClick={() => { setShapes((p) => p.filter((s) => s.id !== selectedId)); setSelectedId(null); }}
                  title="Delete selected">
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              </div>
            </div>
          );
        })()}
      </div>}
    </div>
  );
}

export default App;
