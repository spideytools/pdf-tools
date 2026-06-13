import { useCallback, useEffect, useRef, useState } from "react";
import {
  Type,
  Square,
  Pencil,
  Eraser,
  Highlighter,
  Undo2,
  Trash2,
  Loader2,
  Download,
  ChevronUp,
  ChevronDown,
  Info,
} from "lucide-react";

import { loadPdfDoc, renderPageToDataUrl, type PdfDoc, type RenderedPage } from "../utils/pdfRender";
import { applyAnnotations, type Annotation } from "../utils/pdfAnnotate";
import { downloadFile, formatBytes, stemName } from "../utils/downloader";

interface PdfFile {
  id: string;
  name: string;
  size: number;
  data: ArrayBuffer;
  pageCount: number | null;
}

type Tool = "text" | "highlight" | "whiteout" | "rect" | "draw";

const TOOLS: { id: Tool; label: string; Icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "text",      label: "Text",      Icon: Type },
  { id: "highlight", label: "Highlight", Icon: Highlighter },
  { id: "whiteout",  label: "Whiteout",  Icon: Eraser },
  { id: "rect",      label: "Rectangle", Icon: Square },
  { id: "draw",      label: "Draw",      Icon: Pencil },
];

const RENDER_WIDTH = 800; // px to render main view
const THUMB_WIDTH  = 88;  // px to render thumbnails

// ─── Annotation SVG shape ─────────────────────────────────────────────────────

function AnnShape({ ann, vbW, vbH }: { ann: Annotation; vbW: number; vbH: number }) {
  if (ann.type === "text") {
    return (
      <text
        x={ann.x * vbW}
        y={ann.y * vbH}
        fontSize={ann.fontSize}
        fill={ann.color}
        opacity={ann.opacity}
        dominantBaseline="hanging"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {ann.text}
      </text>
    );
  }

  if (ann.type === "highlight" || ann.type === "whiteout" || ann.type === "rect") {
    const isWhiteout   = ann.type === "whiteout";
    const isHighlight  = ann.type === "highlight";
    const isRect       = ann.type === "rect";
    return (
      <rect
        x={ann.x * vbW}
        y={ann.y * vbH}
        width={ann.width * vbW}
        height={ann.height * vbH}
        fill={isWhiteout ? "white" : isHighlight ? ann.color : "none"}
        fillOpacity={isWhiteout ? 1 : isHighlight ? ann.opacity : 0}
        stroke={isRect ? ann.color : "none"}
        strokeWidth={isRect ? 2 : 0}
        opacity={isRect ? ann.opacity : undefined}
        style={{ pointerEvents: "none" }}
      />
    );
  }

  if (ann.type === "draw") {
    return (
      <polyline
        points={ann.points.map(([x, y]) => `${x * vbW},${y * vbH}`).join(" ")}
        fill="none"
        stroke={ann.color}
        strokeWidth={ann.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={ann.opacity}
        style={{ pointerEvents: "none" }}
      />
    );
  }

  return null;
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export function PdfEditor({
  file,
  darkMode,
  onStatus,
}: {
  file: PdfFile;
  darkMode: boolean;
  onStatus: (msg: string) => void;
}) {
  const [pdfDoc,   setPdfDoc]   = useState<PdfDoc | null>(null);
  const [pageCount,setPageCount]= useState(0);
  const [curPage,  setCurPage]  = useState(0);

  const [pageImages,    setPageImages]    = useState<Map<number, RenderedPage>>(new Map());
  const [thumbUrls,     setThumbUrls]     = useState<Map<number, string>>(new Map());
  const [loadingPage,   setLoadingPage]   = useState(false);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [tool,        setTool]        = useState<Tool>("text");
  const [color,       setColor]       = useState("#ef4444");
  const [fontSize,    setFontSize]    = useState(14);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [opacity,     setOpacity]     = useState(0.85);

  // Pointer / drawing state
  const [pointerDown, setPointerDown] = useState(false);
  const [dragStart,   setDragStart]   = useState<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drawPoints,  setDrawPoints]  = useState<[number, number][]>([]);

  // Text popup
  const [textPopup, setTextPopup] = useState<{ nx: number; ny: number } | null>(null);
  const [textVal,   setTextVal]   = useState("");

  const [isSaving, setIsSaving] = useState(false);

  const svgRef      = useRef<SVGSVGElement>(null);
  const textInputRef= useRef<HTMLInputElement>(null);
  // Ref to avoid stale closure in thumbnail loop
  const thumbUrlsRef = useRef(thumbUrls);
  thumbUrlsRef.current = thumbUrls;

  // ── Load PDF ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let doc: PdfDoc | null = null;

    setPdfDoc(null);
    setPageImages(new Map());
    setThumbUrls(new Map());
    setAnnotations([]);
    setCurPage(0);

    (async () => {
      try {
        doc = await loadPdfDoc(file.data);
        if (cancelled) { await doc.destroy(); return; }
        setPdfDoc(doc);
        setPageCount(doc.numPages);
      } catch (e) {
        if (!cancelled) onStatus(`❌ Failed to load PDF: ${(e as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
      doc?.destroy().catch(() => {/* ignore */});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.id]);

  // ── Render current page ────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || pageImages.has(curPage)) return;
    let cancelled = false;
    setLoadingPage(true);

    (async () => {
      try {
        const img = await renderPageToDataUrl(pdfDoc, curPage, RENDER_WIDTH);
        if (!cancelled) setPageImages(prev => new Map(prev).set(curPage, img));
      } catch (e) {
        if (!cancelled) onStatus(`❌ ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoadingPage(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, curPage]);

  // ── Render thumbnails (background) ────────────────────────────────────────
  useEffect(() => {
    if (!pdfDoc || pageCount === 0) return;
    let cancelled = false;

    (async () => {
      for (let i = 0; i < pageCount; i++) {
        if (cancelled) break;
        if (thumbUrlsRef.current.has(i)) continue;
        try {
          const { dataUrl } = await renderPageToDataUrl(pdfDoc, i, THUMB_WIDTH);
          if (cancelled) break;
          setThumbUrls(prev => new Map(prev).set(i, dataUrl));
        } catch { /* ignore individual thumbnail errors */ }
        await new Promise(r => setTimeout(r, 30));
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, pageCount]);

  // ── Escape: cancel in-progress draw or close text popup ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (textPopup) {
        setTextPopup(null);
        setTextVal("");
        return;
      }
      if (pointerDown && tool === "draw") {
        setDrawPoints([]);
        setPointerDown(false);
        setDragStart(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [textPopup, pointerDown, tool]);

  // ── SVG coordinate → normalised fraction ──────────────────────────────────
  const toNorm = useCallback(
    (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const s = pt.matrixTransform(ctm.inverse());
      const vb = svg.viewBox.baseVal;
      return { x: s.x / vb.width, y: s.y / vb.height };
    },
    []
  );

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const pt = toNorm(e);
    if (!pt) return;
    (e.target as Element).setPointerCapture(e.pointerId);

    if (tool === "text") {
      if (textPopup && textVal.trim()) confirmText();
      setTextPopup({ nx: pt.x, ny: pt.y });
      setTextVal("");
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    setPointerDown(true);
    setDragStart(pt);
    if (tool === "draw") setDrawPoints([[pt.x, pt.y]]);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerDown || !dragStart) return;
    const pt = toNorm(e);
    if (!pt) return;

    if (tool === "draw") {
      setDrawPoints(prev => [...prev, [pt.x, pt.y]]);
      return;
    }
    setPreviewRect({
      x: Math.min(dragStart.x, pt.x),
      y: Math.min(dragStart.y, pt.y),
      w: Math.abs(pt.x - dragStart.x),
      h: Math.abs(pt.y - dragStart.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointerDown) return;
    const pt = toNorm(e);
    setPointerDown(false);

    if (tool === "draw") {
      if (drawPoints.length > 1) {
        addAnnotation({
          type: "draw",
          x: 0, y: 0,
          points: drawPoints,
          strokeWidth,
        });
      }
      setDrawPoints([]);
      setDragStart(null);
      return;
    }

    if (!pt || !dragStart) { setPreviewRect(null); setDragStart(null); return; }
    const x = Math.min(dragStart.x, pt.x);
    const y = Math.min(dragStart.y, pt.y);
    const w = Math.abs(pt.x - dragStart.x);
    const h = Math.abs(pt.y - dragStart.y);

    setPreviewRect(null);
    setDragStart(null);
    if (w < 0.005 || h < 0.005) return;

    const effectiveOpacity = tool === "highlight" ? 0.35 : tool === "whiteout" ? 1 : opacity;
    const id = Math.random().toString(36).slice(2);
    setAnnotations(prev => [
      ...prev,
      {
        id, page: curPage, color, opacity: effectiveOpacity,
        type: tool as "highlight" | "whiteout" | "rect",
        x, y, width: w, height: h, strokeWidth,
      } as Annotation,
    ]);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addAnnotation = (partial: Record<string, any>) => {
    const id = Math.random().toString(36).slice(2);
    setAnnotations(prev => [
      ...prev,
      { ...partial, id, page: curPage, color, opacity } as Annotation,
    ]);
  };

  const confirmText = () => {
    if (!textPopup || !textVal.trim()) { setTextPopup(null); return; }
    const id = Math.random().toString(36).slice(2);
    setAnnotations(prev => [
      ...prev,
      { id, type: "text", page: curPage, x: textPopup.nx, y: textPopup.ny, color, opacity: 1, text: textVal.trim(), fontSize } as Annotation,
    ]);
    setTextPopup(null);
    setTextVal("");
  };

  const handleUndo = () => {
    setAnnotations(prev => {
      const idx = [...prev].map((_, i) => i).reverse().find(i => prev[i].page === curPage);
      return idx != null ? prev.filter((_, i) => i !== idx) : prev;
    });
  };

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (annotations.length === 0) {
      onStatus("❌ Nothing to save — add some annotations first");
      return;
    }
    setIsSaving(true);
    try {
      const bytes = await applyAnnotations(file.data, annotations);
      downloadFile(bytes, `${stemName(file.name)}_edited.pdf`);
      onStatus(`✅ Saved with ${annotations.length} annotation${annotations.length !== 1 ? "s" : ""} — ${formatBytes(bytes.byteLength)}`);
    } catch (e) {
      onStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const curImage = pageImages.get(curPage);
  const vbW = curImage?.widthPx  ?? RENDER_WIDTH;
  const vbH = curImage?.heightPx ?? 1100;
  const pageAnns = annotations.filter(a => a.page === curPage);
  const toolCursor = tool === "text" ? "text" : "crosshair";
  const pageAnnsCount = annotations.filter(a => a.page === curPage).length;

  // ── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${
        darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white"
      }`}>

        {/* Tool selector */}
        <div className={`flex gap-0.5 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setTool(id); setTextPopup(null); }}
              title={label}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                tool === id
                  ? "bg-orange-500 text-white"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-700 hover:text-slate-100"
                  : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              <Icon size={13} />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        <div className={`hidden h-6 w-px sm:block ${darkMode ? "bg-slate-700" : "bg-slate-200"}`} />

        {/* Color */}
        <div className="flex items-center gap-1.5">
          <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Color</span>
          <input
            type="color"
            value={color}
            onChange={e => setColor(e.target.value)}
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
        </div>

        {/* Font size — text only */}
        {tool === "text" && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              {fontSize}px
            </span>
            <input
              type="range"
              value={fontSize}
              onChange={e => setFontSize(Number(e.target.value))}
              min={6} max={72} step={2}
              className="w-20"
            />
          </div>
        )}

        {/* Stroke width — draw / rect */}
        {(tool === "draw" || tool === "rect") && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              {strokeWidth}px
            </span>
            <input
              type="range"
              value={strokeWidth}
              onChange={e => setStrokeWidth(Number(e.target.value))}
              min={1} max={20} step={1}
              className="w-20"
            />
          </div>
        )}

        {/* Opacity — not for text / whiteout */}
        {tool !== "text" && tool !== "whiteout" && tool !== "highlight" && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              {Math.round(opacity * 100)}%
            </span>
            <input
              type="range"
              min={10} max={100} step={5}
              value={Math.round(opacity * 100)}
              onChange={e => setOpacity(Number(e.target.value) / 100)}
              className="w-20"
            />
          </div>
        )}

        {/* Right side actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={pageAnnsCount === 0}
            title={`Undo last annotation on this page (${pageAnnsCount} on page ${curPage + 1})`}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-30 ${
              darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <Undo2 size={13} />Undo
          </button>

          <button
            type="button"
            onClick={() => setAnnotations(prev => prev.filter(a => a.page !== curPage))}
            disabled={pageAnnsCount === 0}
            title={`Clear all ${pageAnnsCount} annotation${pageAnnsCount !== 1 ? "s" : ""} on this page`}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-30 ${
              darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-rose-400" : "text-slate-500 hover:bg-slate-100 hover:text-rose-600"
            }`}
          >
            <Trash2 size={13} />Clear
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || annotations.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isSaving ? "Saving…" : annotations.length > 0 ? `Save (${annotations.length})` : "Save PDF"}
          </button>
        </div>
      </div>

      {/* ── Editor body ────────────────────────────────────────────────────── */}
      <div className="flex gap-3" style={{ minHeight: 0 }}>

        {/* Thumbnail sidebar */}
        <div
          className={`flex w-24 shrink-0 flex-col gap-1.5 rounded-xl border p-2 ${
            darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"
          }`}
          style={{ maxHeight: "68vh" }}
        >
          {/* Page navigation header */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-0.5">
              <button
                type="button"
                onClick={() => setCurPage(p => Math.max(0, p - 1))}
                disabled={curPage === 0}
                title="Previous page"
                className={`rounded p-0.5 transition disabled:opacity-25 ${
                  darkMode ? "text-slate-500 hover:bg-slate-800 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <ChevronUp size={13} />
              </button>
              <span className={`text-[10px] font-medium tabular-nums ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                {curPage + 1}/{pageCount}
              </span>
              <button
                type="button"
                onClick={() => setCurPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={curPage === pageCount - 1}
                title="Next page"
                className={`rounded p-0.5 transition disabled:opacity-25 ${
                  darkMode ? "text-slate-500 hover:bg-slate-800 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                }`}
              >
                <ChevronDown size={13} />
              </button>
            </div>
          )}

          {/* Scrollable thumbnails */}
          <div className="flex flex-col gap-1.5 overflow-y-auto">
            {Array.from({ length: pageCount }, (_, i) => {
              const annCount = annotations.filter(a => a.page === i).length;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurPage(i)}
                  className={`relative flex flex-col items-center gap-1 rounded-lg p-1 transition ${
                    curPage === i
                      ? darkMode
                        ? "bg-orange-900/40 ring-1 ring-orange-500"
                        : "bg-orange-50 ring-1 ring-orange-400"
                      : darkMode
                      ? "hover:bg-slate-800"
                      : "hover:bg-slate-50"
                  }`}
                >
                  {thumbUrls.has(i) ? (
                    <img src={thumbUrls.get(i)} alt={`Page ${i + 1}`} className="w-full rounded border border-slate-200/30" draggable={false} />
                  ) : (
                    <div className={`flex aspect-[3/4] w-full items-center justify-center rounded border ${
                      darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"
                    }`}>
                      <Loader2 size={12} className="animate-spin text-slate-500" />
                    </div>
                  )}
                  {/* Annotation count badge */}
                  {annCount > 0 && (
                    <span className="absolute right-1 top-1 flex min-w-[15px] items-center justify-center rounded-full bg-orange-500 px-1 text-[8px] font-bold text-white">
                      {annCount}
                    </span>
                  )}
                  <span className={`text-[10px] font-medium ${
                    curPage === i
                      ? darkMode ? "text-orange-400" : "text-orange-600"
                      : darkMode ? "text-slate-500" : "text-slate-400"
                  }`}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main viewer */}
        <div
          className={`flex flex-1 items-start justify-center overflow-auto rounded-xl border ${
            darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-100"
          }`}
          style={{ maxHeight: "68vh" }}
        >
          {(!pdfDoc || loadingPage) ? (
            <div className="flex h-64 w-full items-center justify-center gap-2">
              <Loader2 size={20} className={`animate-spin ${darkMode ? "text-slate-500" : "text-slate-400"}`} />
              <span className={`text-sm ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                {!pdfDoc ? "Loading PDF…" : "Rendering page…"}
              </span>
            </div>
          ) : curImage ? (
            /* Outer div positions the SVG overlay on top of the page image */
            <div className="relative inline-block">
              <img
                src={curImage.dataUrl}
                alt={`Page ${curPage + 1}`}
                draggable={false}
                className="block max-w-full select-none shadow-md"
                style={{ maxHeight: "calc(68vh - 8px)" }}
              />
              <svg
                ref={svgRef}
                className="absolute inset-0 h-full w-full"
                viewBox={`0 0 ${vbW} ${vbH}`}
                style={{ cursor: toolCursor, touchAction: "none" }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={e => { if (pointerDown) handlePointerUp(e); }}
              >
                {/* Committed annotations */}
                {pageAnns.map(ann => (
                  <AnnShape key={ann.id} ann={ann} vbW={vbW} vbH={vbH} />
                ))}

                {/* Live freehand preview */}
                {tool === "draw" && drawPoints.length > 1 && (
                  <polyline
                    points={drawPoints.map(([x, y]) => `${x * vbW},${y * vbH}`).join(" ")}
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeLinecap="round" strokeLinejoin="round" opacity={opacity}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Live rect preview */}
                {previewRect && tool !== "draw" && (
                  <rect
                    x={previewRect.x * vbW} y={previewRect.y * vbH}
                    width={previewRect.w * vbW} height={previewRect.h * vbH}
                    fill={tool === "whiteout" ? "white" : tool === "highlight" ? color : "none"}
                    fillOpacity={tool === "whiteout" ? 1 : tool === "highlight" ? 0.35 : 0}
                    stroke={tool === "rect" ? color : "none"}
                    strokeWidth={tool === "rect" ? strokeWidth : 0}
                    strokeDasharray="5 3"
                    style={{ pointerEvents: "none" }}
                  />
                )}
              </svg>

              {/* Floating text input */}
              {textPopup && (
                <div
                  className="absolute z-20 -translate-y-1/2"
                  style={{
                    left: `${Math.min(textPopup.nx * 100, 62)}%`,
                    top: `${Math.max(3, Math.min(textPopup.ny * 100, 94))}%`,
                  }}
                >
                  <div className={`flex overflow-hidden rounded-xl border shadow-xl ${
                    darkMode ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"
                  }`}>
                    <input
                      ref={textInputRef}
                      type="text"
                      value={textVal}
                      onChange={e => setTextVal(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); confirmText(); }
                        if (e.key === "Escape") setTextPopup(null);
                      }}
                      placeholder="Type text…"
                      style={{ color, fontSize: `${Math.min(fontSize, 20)}px` }}
                      className={`w-48 bg-transparent px-3 py-1.5 text-sm outline-none ${
                        darkMode ? "placeholder-slate-600" : "placeholder-slate-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={confirmText}
                      className="bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-400"
                    >
                      ✓
                    </button>
                  </div>
                  <p className={`mt-0.5 text-[10px] ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
                    Enter to place · Esc to cancel
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-64 w-full items-center justify-center">
              <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
          )}
        </div>
      </div>

      {/* ── Note ───────────────────────────────────────────────────────────── */}
      <p className={`flex items-center gap-1.5 text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
        <Info size={11} />
        Annotations are overlaid on top of existing content. Editing original text requires a desktop PDF editor.
      </p>
    </div>
  );
}
