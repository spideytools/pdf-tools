import { useEffect, useRef, useState } from "react";
import { Loader2, CheckSquare, Square, RotateCcw } from "lucide-react";
import { loadPdfDoc, type PdfDoc } from "../utils/pdfRender";

const THUMB_W = 100;

interface Props {
  data: ArrayBuffer;
  fileId: string;
  darkMode: boolean;
  selected: Set<number>;          // 0-indexed
  onChange: (s: Set<number>) => void;
}

export function PagePicker({ data, fileId, darkMode, selected, onChange }: Props) {
  const [doc,    setDoc]    = useState<PdfDoc | null>(null);
  const [thumbs, setThumbs] = useState<Map<number, string>>(new Map());
  const [total,  setTotal]  = useState(0);
  const docRef = useRef<PdfDoc | null>(null);

  useEffect(() => {
    let cancelled = false;
    docRef.current?.destroy().catch(() => {});
    setDoc(null);
    setThumbs(new Map());
    setTotal(0);

    (async () => {
      const d = await loadPdfDoc(data);
      docRef.current = d;
      if (cancelled) { d.destroy(); return; }
      setDoc(d);
      setTotal(d.numPages);

      for (let i = 0; i < d.numPages; i++) {
        if (cancelled) break;
        try {
          const page = await d.getPage(i + 1);
          const vp1  = page.getViewport({ scale: 1 });
          const scale = THUMB_W / vp1.width;
          const vp   = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width  = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          page.cleanup();

          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          if (!cancelled) setThumbs(prev => new Map(prev).set(i, dataUrl));
        } catch { /* skip failed thumbnail */ }
        await new Promise(r => setTimeout(r, 20));
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  const toggle = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    onChange(next);
  };

  const selectAll   = () => onChange(new Set(Array.from({ length: total }, (_, i) => i)));
  const clearAll    = () => onChange(new Set());
  const invert      = () => {
    const next = new Set(Array.from({ length: total }, (_, i) => i).filter(i => !selected.has(i)));
    onChange(next);
  };

  const dm = darkMode;

  if (!doc) {
    return (
      <div className="flex h-32 items-center justify-center gap-2">
        <Loader2 size={18} className={`animate-spin ${dm ? "text-slate-500" : "text-slate-400"}`} />
        <span className={`text-sm ${dm ? "text-slate-500" : "text-slate-400"}`}>Loading pages…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${dm ? "text-slate-500" : "text-slate-400"}`}>
          {total} pages
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={selectAll}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
              dm ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <CheckSquare size={12} />All
          </button>
          <button
            type="button"
            onClick={invert}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
              dm ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            }`}
          >
            <RotateCcw size={12} />Invert
          </button>
          <button
            type="button"
            onClick={clearAll}
            className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
              dm ? "text-slate-400 hover:bg-slate-800 hover:text-rose-400" : "text-slate-500 hover:bg-slate-100 hover:text-rose-600"
            }`}
          >
            <Square size={12} />Clear
          </button>
        </div>
      </div>

      {/* Thumbnail grid */}
      <div
        className={`overflow-y-auto rounded-xl border p-2 ${dm ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}
        style={{ maxHeight: "280px" }}
      >
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))" }}>
          {Array.from({ length: total }, (_, i) => {
            const isSelected = selected.has(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggle(i)}
                className={`relative flex flex-col items-center gap-1 rounded-lg border-2 p-1 text-center transition ${
                  isSelected
                    ? "border-orange-500 bg-orange-500/10"
                    : dm
                    ? "border-slate-700 hover:border-slate-500 hover:bg-slate-800"
                    : "border-slate-200 hover:border-slate-400 hover:bg-white"
                }`}
              >
                {thumbs.has(i) ? (
                  <img
                    src={thumbs.get(i)}
                    alt={`Page ${i + 1}`}
                    draggable={false}
                    className="w-full rounded"
                  />
                ) : (
                  <div
                    className={`flex aspect-[3/4] w-full items-center justify-center rounded ${
                      dm ? "bg-slate-800" : "bg-slate-200"
                    }`}
                  >
                    <Loader2 size={12} className="animate-spin text-slate-400" />
                  </div>
                )}

                {isSelected && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
                    ✓
                  </span>
                )}

                <span className={`text-[10px] font-medium ${isSelected ? dm ? "text-orange-400" : "text-orange-600" : dm ? "text-slate-500" : "text-slate-400"}`}>
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection summary */}
      <p className={`text-xs ${dm ? "text-slate-500" : "text-slate-400"}`}>
        {selected.size === 0
          ? "Click pages to select them"
          : `${selected.size} page${selected.size !== 1 ? "s" : ""} selected: ${
              [...selected].sort((a, b) => a - b).map(n => n + 1).join(", ")
            }`}
      </p>
    </div>
  );
}
