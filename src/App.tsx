import { useCallback, useEffect, useRef, useState } from "react";
import {
  Layers,
  Scissors,
  RotateCw,
  FileOutput,
  Minimize2,
  PenLine,
  Moon,
  Sun,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
  Upload,
  Download,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Image,
  ImagePlus,
  Stamp,
  Hash,
  Lock,
  LockOpen,
  GripVertical,
} from "lucide-react";

import { PdfEditor }    from "./components/PdfEditor";
import { PagePicker }   from "./components/PagePicker";

import { mergePDFs }    from "./utils/pdfMerge";
import {
  getPdfPageCount,
  splitPDFByRanges,
  splitPDFAllPages,
} from "./utils/pdfSplit";
import { rotatePDF }    from "./utils/pdfRotate";
import { extractPages } from "./utils/pdfExtract";
import { compressPDF, type CompressMode } from "./utils/pdfCompress";
import { pdfToImages,  type ImageFormat, type ImageDpi } from "./utils/pdfToImages";
import { imagesToPdf }  from "./utils/imagesToPdf";
import { addWatermark, type WatermarkOptions } from "./utils/pdfWatermark";
import { addPageNumbers, type PageNumPosition, type PageNumFormat } from "./utils/pdfPageNumbers";
import { unlockPDF } from "./utils/pdfPassword";
import { downloadFile, formatBytes, stemName } from "./utils/downloader";
import { downloadAsZip } from "./utils/zipDownloader";

type Theme    = "dark" | "light";
type ToolMode =
  | "merge" | "split" | "rotate" | "extract" | "compress" | "edit"
  | "pdf-to-img" | "img-to-pdf" | "watermark" | "page-nums" | "password";

interface PdfFile {
  id: string;
  name: string;
  size: number;
  data: ArrayBuffer;
  pageCount: number | null;
}

const getInitialTheme = (): Theme => {
  const stored = localStorage.getItem("pdf-tools-theme");
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function uid() { return Math.random().toString(36).slice(2); }

async function readFile(file: File): Promise<PdfFile> {
  const data = await file.arrayBuffer();
  return { id: uid(), name: file.name, size: file.size, data, pageCount: null };
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  onFiles, multiple, darkMode, compact, accept, label,
}: {
  onFiles: (files: File[]) => void;
  multiple: boolean;
  darkMode: boolean;
  compact?: boolean;
  accept?: string;
  label?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const accepted = Array.from(e.dataTransfer.files).filter(f =>
        accept
          ? accept.split(",").some(a => f.type === a.trim() || f.name.toLowerCase().endsWith(a.trim().replace("*", "")))
          : f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (accepted.length) onFiles(accepted);
    },
    [onFiles, accept]
  );

  const dropLabel = label ?? (multiple ? "Drop PDFs or click to browse" : "Drop a PDF or click to browse");

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-all ${
        compact ? "px-4 py-5" : "px-6 py-10"
      } ${
        dragging
          ? darkMode ? "border-orange-400 bg-orange-950/30" : "border-orange-400 bg-orange-50"
          : darkMode
          ? "border-slate-700 hover:border-slate-500 hover:bg-slate-800/40"
          : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <Upload size={compact ? 20 : 28} className={dragging ? "text-orange-400" : darkMode ? "text-slate-600" : "text-slate-400"} />
      <div className="text-center">
        <p className={`${compact ? "text-xs" : "text-sm"} font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          {dragging ? "Drop here" : dropLabel}
        </p>
        {!compact && (
          <p className={`mt-0.5 text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
            {accept ? accept.replace(/application\/pdf,?/g, "PDF").replace(/image\/\*/g, "PNG, JPG").trim() : "PDF files only"}
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? ".pdf,application/pdf"}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── File chip (merge, with drag-and-drop) ────────────────────────────────────

function FileChip({
  file, darkMode, onRemove, index, badge,
  draggable: isDraggable, onDragStart, onDragOver, onDrop, isDragTarget,
}: {
  file: PdfFile;
  darkMode: boolean;
  onRemove?: () => void;
  index: number;
  badge?: string;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isDragTarget?: boolean;
}) {
  return (
    <div
      draggable={isDraggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
        isDragTarget
          ? darkMode ? "border-orange-500 bg-orange-950/30" : "border-orange-400 bg-orange-50"
          : darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
      } ${isDraggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {isDraggable && (
        <GripVertical size={14} className={`shrink-0 ${darkMode ? "text-slate-600" : "text-slate-300"}`} />
      )}

      <span className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
        darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
      }`}>
        {index + 1}
      </span>

      <FileText size={14} className={`shrink-0 ${darkMode ? "text-orange-400" : "text-orange-500"}`} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{file.name}</p>
          {badge && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              darkMode ? "bg-orange-900/60 text-orange-300" : "bg-orange-100 text-orange-600"
            }`}>{badge}</span>
          )}
        </div>
        <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
          {formatBytes(file.size)}
          {file.pageCount != null ? ` · ${file.pageCount} page${file.pageCount !== 1 ? "s" : ""}` : " · loading pages…"}
        </p>
      </div>

      {onRemove && (
        <button
          type="button" onClick={onRemove}
          className={`shrink-0 rounded-lg p-1 transition ${
            darkMode ? "text-slate-500 hover:bg-slate-800 hover:text-rose-400" : "text-slate-400 hover:bg-slate-100 hover:text-rose-500"
          }`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Image file chip (img-to-pdf) ─────────────────────────────────────────────

function ImageChip({
  file, index, total, darkMode, onRemove, onMoveUp, onMoveDown,
}: {
  file: File; index: number; total: number; darkMode: boolean;
  onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
      darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
    }`}>
      <div className="flex shrink-0 flex-col gap-0.5">
        <button type="button" onClick={onMoveUp} disabled={index === 0}
          className={`rounded p-0.5 transition disabled:opacity-20 ${darkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700"}`}>
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={onMoveDown} disabled={index === total - 1}
          className={`rounded p-0.5 transition disabled:opacity-20 ${darkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700"}`}>
          <ChevronDown size={14} />
        </button>
      </div>
      <Image size={14} className={`shrink-0 ${darkMode ? "text-sky-400" : "text-sky-500"}`} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{file.name}</p>
        <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{formatBytes(file.size)}</p>
      </div>
      <button type="button" onClick={onRemove}
        className={`shrink-0 rounded-lg p-1 transition ${darkMode ? "text-slate-500 hover:bg-slate-800 hover:text-rose-400" : "text-slate-400 hover:bg-slate-100 hover:text-rose-500"}`}>
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed py-16 ${
      darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"
    }`}>
      <Upload size={32} className={darkMode ? "text-slate-700" : "text-slate-300"} />
      <p className="text-sm">Upload a PDF above to get started.</p>
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function Card({ darkMode, children, className = "" }: { darkMode: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"} ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ darkMode, children }: { darkMode: boolean; children: React.ReactNode }) {
  return (
    <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
      {children}
    </h2>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const darkMode = theme === "dark";

  const [toolMode, setToolMode] = useState<ToolMode>("merge");
  const [status,        setStatus]        = useState("");
  const [isProcessing,  setIsProcessing]  = useState(false);
  const [progress,      setProgress]      = useState<{ done: number; total: number } | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Global file ────────────────────────────────────────────────────────────
  const [globalFile, setGlobalFile] = useState<PdfFile | null>(null);

  // ── Merge ──────────────────────────────────────────────────────────────────
  const [mergeExtras,   setMergeExtras]   = useState<PdfFile[]>([]);
  const [dragFromIdx,   setDragFromIdx]   = useState<number | null>(null);
  const [dragOverIdx,   setDragOverIdx]   = useState<number | null>(null);

  // ── Split ──────────────────────────────────────────────────────────────────
  const [splitMode,     setSplitMode]     = useState<"all" | "picker">("all");
  const [splitSelected, setSplitSelected] = useState<Set<number>>(new Set());

  // ── Rotate ─────────────────────────────────────────────────────────────────
  const [rotateAngle,   setRotateAngle]   = useState<90 | 180 | 270>(90);
  const [rotatePages,   setRotatePages]   = useState("");

  // ── Extract ────────────────────────────────────────────────────────────────
  const [extractSelected, setExtractSelected] = useState<Set<number>>(new Set());

  // ── Compress ───────────────────────────────────────────────────────────────
  const [compressMode,   setCompressMode]   = useState<CompressMode>("lossless");
  const [compressResult, setCompressResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);

  // ── PDF → Images ───────────────────────────────────────────────────────────
  const [imgFormat,  setImgFormat]  = useState<ImageFormat>("jpeg");
  const [imgDpi,     setImgDpi]     = useState<ImageDpi>(150);
  const [imgQuality, setImgQuality] = useState(85);

  // ── Images → PDF ───────────────────────────────────────────────────────────
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // ── Watermark ──────────────────────────────────────────────────────────────
  const [wmText,     setWmText]     = useState("CONFIDENTIAL");
  const [wmFontSize, setWmFontSize] = useState(60);
  const [wmColor,    setWmColor]    = useState("#888888");
  const [wmOpacity,  setWmOpacity]  = useState(0.3);
  const [wmDiagonal, setWmDiagonal] = useState(true);

  // ── Page Numbers ───────────────────────────────────────────────────────────
  const [pnPosition, setPnPosition] = useState<PageNumPosition>("bottom-center");
  const [pnFormat,   setPnFormat]   = useState<PageNumFormat>("n");
  const [pnFontSize, setPnFontSize] = useState(11);
  const [pnColor,    setPnColor]    = useState("#444444");
  const [pnStartAt,  setPnStartAt]  = useState(1);
  const [pnMargin,   setPnMargin]   = useState(20);


  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("pdf-tools-theme", theme);
  }, [theme]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const shortcuts: Record<string, ToolMode> = {
      m: "merge", s: "split", r: "rotate", e: "extract",
      c: "compress", d: "edit", i: "pdf-to-img", p: "password",
      w: "watermark", n: "page-nums",
    };
    const handler = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const mode = shortcuts[ev.key.toLowerCase()];
      if (mode && !isProcessing) setToolMode(mode);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isProcessing]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setProgress(null);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(""), 8000);
  };

  const onProgress = (done: number, total: number) => setProgress({ done, total });

  const loadPageCount = useCallback(async (file: PdfFile, setter: (u: (p: PdfFile | null) => PdfFile | null) => void) => {
    try {
      const count = await getPdfPageCount(file.data);
      setter(prev => prev?.id === file.id ? { ...prev, pageCount: count } : prev);
    } catch { /* ignore */ }
  }, []);

  const loadPageCountList = useCallback(async (files: PdfFile[], setter: React.Dispatch<React.SetStateAction<PdfFile[]>>) => {
    for (const file of files) {
      if (file.pageCount != null) continue;
      try {
        const count = await getPdfPageCount(file.data);
        setter(prev => prev.map(f => f.id === file.id ? { ...f, pageCount: count } : f));
      } catch { /* ignore */ }
    }
  }, []);

  // ── Global file ────────────────────────────────────────────────────────────

  const handleGlobalLoad = async (files: File[]) => {
    const f = await readFile(files[0]);
    setGlobalFile(f);
    setCompressResult(null);
    setSplitSelected(new Set());
    setExtractSelected(new Set());
    loadPageCount(f, setGlobalFile);
  };

  const handleGlobalRemove = () => {
    setGlobalFile(null);
    setMergeExtras([]);
    setCompressResult(null);
    setSplitSelected(new Set());
    setExtractSelected(new Set());
    setStatus("");
  };

  // ── Merge drag-and-drop ────────────────────────────────────────────────────

  const handleMergeAddExtras = async (files: File[]) => {
    const newFiles = await Promise.all(files.map(readFile));
    setMergeExtras(prev => {
      const next = [...prev, ...newFiles];
      loadPageCountList(next, setMergeExtras);
      return next;
    });
  };

  const mergeAllFiles = globalFile ? [globalFile, ...mergeExtras] : mergeExtras;

  const handleMergeDragStart = (extraIdx: number) => setDragFromIdx(extraIdx);
  const handleMergeDragOver  = (e: React.DragEvent, extraIdx: number) => {
    e.preventDefault();
    setDragOverIdx(extraIdx);
  };
  const handleMergeDrop = (targetIdx: number) => {
    if (dragFromIdx == null || dragFromIdx === targetIdx) { setDragFromIdx(null); setDragOverIdx(null); return; }
    setMergeExtras(prev => {
      const next = [...prev];
      const [item] = next.splice(dragFromIdx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
    setDragFromIdx(null);
    setDragOverIdx(null);
  };

  const handleMerge = async () => {
    if (mergeAllFiles.length < 2) return showStatus("❌ Add at least one more PDF to merge");
    setIsProcessing(true);
    try {
      const result = await mergePDFs(mergeAllFiles.map(f => f.data));
      downloadFile(result, `${stemName(globalFile!.name)}_merged.pdf`);
      showStatus(`✅ Merged ${mergeAllFiles.length} PDFs — ${formatBytes(result.byteLength)}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Split ──────────────────────────────────────────────────────────────────

  const handleSplit = async () => {
    if (!globalFile) return;
    if (splitMode === "picker" && splitSelected.size === 0) return showStatus("❌ Select at least one page");
    setIsProcessing(true);
    try {
      let parts: Array<{ bytes: Uint8Array; filename: string }>;
      const base = stemName(globalFile.name);

      if (splitMode === "all") {
        parts = await splitPDFAllPages(globalFile.data);
      } else {
        const sorted = [...splitSelected].sort((a, b) => a - b);
        const ranges = sorted.map(n => ({ start: n + 1, end: n + 1 }));
        parts = await splitPDFByRanges(globalFile.data, ranges);
      }

      if (parts.length === 1) {
        downloadFile(parts[0].bytes, `${base}_${parts[0].filename}`);
      } else {
        await downloadAsZip(
          parts.map(p => ({ bytes: p.bytes, filename: `${base}_${p.filename}` })),
          `${base}_split.zip`
        );
      }
      showStatus(`✅ Split into ${parts.length} file${parts.length !== 1 ? "s" : ""}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Rotate ─────────────────────────────────────────────────────────────────

  const handleRotate = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const result = await rotatePDF(globalFile.data, rotateAngle, rotatePages, globalFile.pageCount ?? 9999);
      downloadFile(result, `${stemName(globalFile.name)}_rotated.pdf`);
      const desc = rotatePages.trim() ? `pages ${rotatePages}` : "all pages";
      showStatus(`✅ Rotated ${desc} by ${rotateAngle}°`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Extract ────────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!globalFile || extractSelected.size === 0) return showStatus("❌ Select at least one page");
    setIsProcessing(true);
    try {
      const sorted = [...extractSelected].sort((a, b) => a - b);
      const rangeStr = sorted.map(n => String(n + 1)).join(",");
      const result = await extractPages(globalFile.data, rangeStr, globalFile.pageCount ?? 9999);
      downloadFile(result, `${stemName(globalFile.name)}_extracted.pdf`);
      showStatus(`✅ Extracted ${sorted.length} page${sorted.length !== 1 ? "s" : ""} — ${formatBytes(result.byteLength)}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Compress ───────────────────────────────────────────────────────────────

  const handleCompress = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    setProgress(null);
    try {
      const bytes = await compressPDF(
        globalFile.data,
        compressMode,
        compressMode !== "lossless" ? onProgress : undefined
      );
      setCompressResult({ bytes, size: bytes.byteLength });
      const saved = globalFile.size - bytes.byteLength;
      const pct = ((saved / globalFile.size) * 100).toFixed(1);
      showStatus(saved > 0 ? `✅ Saved ${formatBytes(saved)} (${pct}%)` : "✅ Re-serialized — already optimized");
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); setProgress(null); }
  };

  const handleCompressDownload = () => {
    if (!globalFile || !compressResult) return;
    downloadFile(compressResult.bytes, `${stemName(globalFile.name)}_compressed.pdf`);
    showStatus("⬇️ Download started");
  };

  // ── PDF → Images ───────────────────────────────────────────────────────────

  const handlePdfToImages = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const pages = await pdfToImages(globalFile.data, imgFormat, imgDpi, imgQuality, onProgress);
      const base = stemName(globalFile.name);
      if (pages.length === 1) {
        const url = URL.createObjectURL(pages[0].blob);
        const a = document.createElement("a");
        a.href = url; a.download = `${base}_${pages[0].filename}`;
        a.click(); URL.revokeObjectURL(url);
      } else {
        const items = await Promise.all(
          pages.map(async p => ({
            bytes: new Uint8Array(await p.blob.arrayBuffer()),
            filename: `${base}_${p.filename}`,
          }))
        );
        await downloadAsZip(items, `${base}_images.zip`);
      }
      showStatus(`✅ Exported ${pages.length} image${pages.length !== 1 ? "s" : ""}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); setProgress(null); }
  };

  // ── Images → PDF ───────────────────────────────────────────────────────────

  const handleImgToPdf = async () => {
    if (imageFiles.length === 0) return showStatus("❌ Add at least one image");
    setIsProcessing(true);
    try {
      const bytes = await imagesToPdf(imageFiles);
      downloadFile(bytes, "images_converted.pdf");
      showStatus(`✅ Created PDF from ${imageFiles.length} image${imageFiles.length !== 1 ? "s" : ""} — ${formatBytes(bytes.byteLength)}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  const moveImage = (i: number, dir: -1 | 1) => {
    setImageFiles(prev => {
      const next = [...prev]; const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  // ── Watermark ──────────────────────────────────────────────────────────────

  const handleWatermark = async () => {
    if (!globalFile) return;
    if (!wmText.trim()) return showStatus("❌ Enter watermark text");
    setIsProcessing(true);
    try {
      const opts: WatermarkOptions = { text: wmText.trim(), fontSize: wmFontSize, color: wmColor, opacity: wmOpacity, diagonal: wmDiagonal };
      const bytes = await addWatermark(globalFile.data, opts);
      downloadFile(bytes, `${stemName(globalFile.name)}_watermarked.pdf`);
      showStatus(`✅ Watermark added — ${formatBytes(bytes.byteLength)}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Page Numbers ───────────────────────────────────────────────────────────

  const handlePageNumbers = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const bytes = await addPageNumbers(globalFile.data, {
        position: pnPosition, format: pnFormat,
        fontSize: pnFontSize, color: pnColor,
        startAt: pnStartAt, margin: pnMargin,
      });
      downloadFile(bytes, `${stemName(globalFile.name)}_numbered.pdf`);
      showStatus(`✅ Page numbers added — ${formatBytes(bytes.byteLength)}`);
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Password ───────────────────────────────────────────────────────────────

  const handlePassword = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const bytes = await unlockPDF(globalFile.data);
      downloadFile(bytes, `${stemName(globalFile.name)}_unlocked.pdf`);
      showStatus("✅ Password removed — saved as unlocked copy");
    } catch (e) { showStatus(`❌ ${(e as Error).message}`); }
    finally { setIsProcessing(false); }
  };

  // ── Shared styles ──────────────────────────────────────────────────────────

  const btnBase     = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition";
  const btnDisabled = "disabled:cursor-not-allowed disabled:opacity-40";
  const actionBtn   = `w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`;

  const tools: { id: ToolMode; label: string; Icon: typeof Layers; key: string }[] = [
    { id: "merge",      label: "Merge",      Icon: Layers,    key: "M" },
    { id: "split",      label: "Split",      Icon: Scissors,  key: "S" },
    { id: "rotate",     label: "Rotate",     Icon: RotateCw,  key: "R" },
    { id: "extract",    label: "Extract",    Icon: FileOutput, key: "E" },
    { id: "compress",   label: "Compress",   Icon: Minimize2, key: "C" },
    { id: "edit",       label: "Edit",       Icon: PenLine,   key: "D" },
    { id: "pdf-to-img", label: "PDF→Images", Icon: Image,     key: "I" },
    { id: "img-to-pdf", label: "Image→PDF",  Icon: ImagePlus, key: "" },
    { id: "watermark",  label: "Watermark",  Icon: Stamp,     key: "W" },
    { id: "page-nums",  label: "Page Nums",  Icon: Hash,      key: "N" },
    { id: "password",   label: "Password",   Icon: Lock,      key: "P" },
  ];

  const toolDisabled = !globalFile || isProcessing;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div data-theme={theme} className="app-shell min-h-screen w-full transition-colors duration-300">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 lg:px-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-red-400 via-orange-300 to-rose-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(239,68,68,0.35)] md:text-3xl">
              PDF Tools
            </h1>
            <p className={`mt-0.5 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Merge · Split · Rotate · Extract · Compress · Edit · Convert · Watermark · Page Numbers · Password
            </p>
          </div>

          <div role="group" aria-label="Theme" className={`flex shrink-0 overflow-hidden rounded-xl border p-1 transition ${darkMode ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"}`}>
            <button type="button" onClick={() => setTheme("light")} title="Light mode"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${!darkMode ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"}`}>
              <Sun size={13} />Light
            </button>
            <button type="button" onClick={() => setTheme("dark")} title="Dark mode"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${darkMode ? "bg-white text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>
              <Moon size={13} />Dark
            </button>
          </div>
        </div>

        {/* ── Global file zone ────────────────────────────────────────────── */}
        <div className={`mb-4 rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>PDF File</h2>
            {globalFile && (
              <button type="button" onClick={handleGlobalRemove}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-rose-400" : "text-slate-500 hover:bg-slate-100 hover:text-rose-500"}`}>
                <Trash2 size={12} />Remove
              </button>
            )}
          </div>

          {globalFile ? (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${darkMode ? "border-orange-800/50 bg-orange-950/20" : "border-orange-200 bg-orange-50/60"}`}>
              <FileText size={18} className={darkMode ? "text-orange-400" : "text-orange-500"} />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>{globalFile.name}</p>
                <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                  {formatBytes(globalFile.size)}
                  {globalFile.pageCount != null ? ` · ${globalFile.pageCount} page${globalFile.pageCount !== 1 ? "s" : ""}` : " · counting pages…"}
                </p>
              </div>
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            </div>
          ) : (
            <DropZone onFiles={handleGlobalLoad} multiple={false} darkMode={darkMode} />
          )}
        </div>

        {/* ── Tool tabs ───────────────────────────────────────────────────── */}
        <div className={`mb-4 flex flex-wrap gap-1 rounded-xl border p-1.5 ${darkMode ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/90"}`}>
          {tools.map(({ id, label, Icon, key }) => (
            <button
              key={id}
              type="button"
              onClick={() => { if (!isProcessing) { setToolMode(id); setStatus(""); } }}
              aria-pressed={toolMode === id}
              disabled={isProcessing && toolMode !== id}
              title={key ? `${label} (${key})` : label}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                toolMode === id
                  ? "bg-orange-500 text-white shadow-sm"
                  : isProcessing
                  ? darkMode ? "cursor-not-allowed text-slate-700" : "cursor-not-allowed text-slate-300"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {/* ── Tool content ────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-5">

          {/* ── MERGE ──────────────────────────────────────────────────── */}
          {toolMode === "merge" && (
            <>
              <div className="flex flex-col gap-4 lg:col-span-3">
                <Card darkMode={darkMode}>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel darkMode={darkMode}>Add More PDFs</SectionLabel>
                    {mergeExtras.length > 0 && (
                      <button type="button" onClick={() => setMergeExtras([])}
                        className={`text-xs ${darkMode ? "text-slate-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"}`}>
                        Clear extras
                      </button>
                    )}
                  </div>
                  <DropZone onFiles={handleMergeAddExtras} multiple darkMode={darkMode} compact />
                </Card>

                {mergeAllFiles.length > 0 && (
                  <Card darkMode={darkMode}>
                    <div className="mb-3 flex items-center justify-between">
                      <SectionLabel darkMode={darkMode}>Merge Order ({mergeAllFiles.length} files)</SectionLabel>
                      <span className={`text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
                        {formatBytes(mergeAllFiles.reduce((s, f) => s + f.size, 0))} total
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {globalFile && (
                        <FileChip file={globalFile} darkMode={darkMode} index={0} badge="main" />
                      )}
                      {mergeExtras.map((f, i) => (
                        <FileChip
                          key={f.id}
                          file={f}
                          darkMode={darkMode}
                          index={i + (globalFile ? 1 : 0)}
                          draggable
                          isDragTarget={dragOverIdx === i}
                          onDragStart={() => handleMergeDragStart(i)}
                          onDragOver={(e) => handleMergeDragOver(e, i)}
                          onDrop={() => handleMergeDrop(i)}
                          onRemove={() => setMergeExtras(prev => prev.filter(x => x.id !== f.id))}
                        />
                      ))}
                    </div>
                    {mergeExtras.length > 1 && (
                      <p className={`mt-2 text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
                        Drag rows to reorder
                      </p>
                    )}
                  </Card>
                )}
              </div>

              <div className="lg:col-span-2">
                <Card darkMode={darkMode}>
                  <SectionLabel darkMode={darkMode}>Merge</SectionLabel>
                  <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    {!globalFile
                      ? "Upload a PDF above first, then add more PDFs here."
                      : mergeExtras.length === 0
                      ? "Add at least one more PDF to merge."
                      : `Ready to merge ${mergeAllFiles.length} PDFs.`}
                  </p>
                  <button type="button" onClick={handleMerge}
                    disabled={mergeAllFiles.length < 2 || isProcessing}
                    className={actionBtn}>
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                    {isProcessing ? "Merging…" : "Merge PDFs"}
                  </button>
                </Card>
              </div>
            </>
          )}

          {/* ── SPLIT ──────────────────────────────────────────────────── */}
          {toolMode === "split" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Split Mode</SectionLabel>
                      <div className={`flex gap-1 rounded-lg border p-0.5 mb-4 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
                        {(["all", "picker"] as const).map(m => (
                          <button key={m} type="button" onClick={() => setSplitMode(m)}
                            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              splitMode === m
                                ? darkMode ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                                : darkMode ? "text-slate-400 hover:text-slate-100" : "text-slate-600 hover:text-slate-950"
                            }`}>
                            {m === "all" ? "Every page" : "Pick pages"}
                          </button>
                        ))}
                      </div>

                      {splitMode === "picker" ? (
                        <PagePicker
                          data={globalFile.data}
                          fileId={globalFile.id}
                          darkMode={darkMode}
                          selected={splitSelected}
                          onChange={setSplitSelected}
                        />
                      ) : (
                        <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Each page is saved as its own PDF, bundled as a ZIP.
                        </p>
                      )}
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Split</SectionLabel>
                      {globalFile.pageCount != null && (
                        <p className={`mb-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {globalFile.pageCount} pages available.
                        </p>
                      )}
                      <button type="button" onClick={handleSplit}
                        disabled={toolDisabled || (splitMode === "picker" && splitSelected.size === 0)}
                        className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                        {isProcessing ? "Splitting…" : "Split PDF"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── ROTATE ─────────────────────────────────────────────────── */}
          {toolMode === "rotate" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Rotation Angle</SectionLabel>
                      <div className="flex gap-2">
                        {([90, 180, 270] as const).map(deg => (
                          <button key={deg} type="button" onClick={() => setRotateAngle(deg)}
                            className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                              rotateAngle === deg
                                ? "border-orange-500 bg-orange-500 text-white"
                                : darkMode
                                ? "border-slate-700 text-slate-400 hover:border-orange-700 hover:text-orange-300"
                                : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"
                            }`}>
                            <RotateCw size={18} style={{ transform: deg === 270 ? "scaleX(-1)" : deg === 180 ? "rotate(180deg)" : undefined }} />
                            {deg === 90 ? "90° CW" : deg === 180 ? "180°" : "90° CCW"}
                          </button>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Pages & Rotate</SectionLabel>
                      <label className={`mb-1 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Pages (blank = all)
                      </label>
                      <input type="text" value={rotatePages} onChange={e => setRotatePages(e.target.value)}
                        placeholder="1-3, 5 — or leave blank" spellCheck={false}
                        className={`mb-3 w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none transition focus:ring-2 ${
                          darkMode ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-600 focus:ring-orange-500/40" : "border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-orange-400/40"
                        }`}
                      />
                      <button type="button" onClick={handleRotate} disabled={toolDisabled} className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                        {isProcessing ? "Rotating…" : "Rotate & Download"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── EXTRACT ────────────────────────────────────────────────── */}
          {toolMode === "extract" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Select Pages to Extract</SectionLabel>
                      <PagePicker
                        data={globalFile.data}
                        fileId={globalFile.id}
                        darkMode={darkMode}
                        selected={extractSelected}
                        onChange={setExtractSelected}
                      />
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Extract</SectionLabel>
                      {globalFile.pageCount != null && (
                        <p className={`mb-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {globalFile.pageCount} pages · {extractSelected.size} selected
                        </p>
                      )}
                      <button type="button" onClick={handleExtract}
                        disabled={toolDisabled || extractSelected.size === 0}
                        className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
                        {isProcessing ? "Extracting…" : "Extract Pages"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── COMPRESS ───────────────────────────────────────────────── */}
          {toolMode === "compress" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="order-1 lg:order-2 lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Compression Mode</SectionLabel>
                      <div className="flex flex-col gap-2 mb-4">
                        {([
                          { id: "lossless", label: "Optimize", desc: "Lossless · keeps text searchable" },
                          { id: "medium",   label: "Compress", desc: "Rasterize at 150 DPI · JPEG 80%" },
                          { id: "high",     label: "Max Compress", desc: "Rasterize at 112 DPI · JPEG 65%" },
                        ] as const).map(({ id, label, desc }) => (
                          <button key={id} type="button" onClick={() => { setCompressMode(id); setCompressResult(null); }}
                            className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition ${
                              compressMode === id
                                ? "border-orange-500 bg-orange-500/10"
                                : darkMode ? "border-slate-700 hover:border-slate-500" : "border-slate-200 hover:border-slate-400"
                            }`}>
                            <span className={`text-xs font-semibold ${compressMode === id ? darkMode ? "text-orange-400" : "text-orange-600" : darkMode ? "text-slate-300" : "text-slate-700"}`}>{label}</span>
                            <span className={`text-[10px] ${darkMode ? "text-slate-500" : "text-slate-400"}`}>{desc}</span>
                          </button>
                        ))}
                      </div>
                      {compressMode !== "lossless" && (
                        <p className={`mb-3 text-[10px] rounded-lg px-2.5 py-2 ${darkMode ? "bg-amber-900/30 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                          ⚠️ Rasterize modes convert to image-based PDF — text will not be selectable.
                        </p>
                      )}
                      {progress && isProcessing && (
                        <div className={`mb-3 rounded-lg px-3 py-2 ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                          <div className={`mb-1 flex justify-between text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                            <span>Processing…</span><span>{progress.done}/{progress.total}</span>
                          </div>
                          <div className={`h-1.5 rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                            <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      <button type="button" onClick={handleCompress} disabled={toolDisabled} className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Minimize2 size={14} />}
                        {isProcessing ? "Compressing…" : "Compress PDF"}
                      </button>
                    </Card>
                  </div>

                  <div className="order-2 lg:order-1 lg:col-span-3">
                    {compressResult && (
                      <Card darkMode={darkMode}>
                        <SectionLabel darkMode={darkMode}>Result</SectionLabel>
                        <div className="flex flex-col gap-2">
                          <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${darkMode ? "bg-slate-800" : "bg-slate-50"}`}>
                            <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Original</span>
                            <span className={`font-mono text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>{formatBytes(globalFile.size)}</span>
                          </div>
                          <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${darkMode ? "border-emerald-800/60 bg-emerald-950/40" : "border-emerald-200 bg-emerald-50"}`}>
                            <span className={`text-xs font-medium ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>Compressed</span>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-sm font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>{formatBytes(compressResult.size)}</span>
                              {compressResult.size < globalFile.size && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${darkMode ? "bg-emerald-900 text-emerald-300" : "bg-emerald-100 text-emerald-700"}`}>
                                  -{(((globalFile.size - compressResult.size) / globalFile.size) * 100).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button type="button" onClick={handleCompressDownload}
                          className={`mt-3 w-full ${btnBase} justify-center bg-emerald-600 hover:bg-emerald-500 py-2.5`}>
                          <Download size={14} />Download Compressed
                        </button>
                      </Card>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── EDIT ───────────────────────────────────────────────────── */}
          {toolMode === "edit" && (
            <div className="lg:col-span-5">
              {!globalFile ? <EmptyState darkMode={darkMode} /> : (
                <PdfEditor file={globalFile} darkMode={darkMode} onStatus={showStatus} />
              )}
            </div>
          )}

          {/* ── PDF → IMAGES ───────────────────────────────────────────── */}
          {toolMode === "pdf-to-img" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Export Settings</SectionLabel>

                      <div className="flex flex-col gap-4">
                        {/* Format */}
                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Format</label>
                          <div className={`flex gap-1 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
                            {(["jpeg", "png"] as const).map(f => (
                              <button key={f} type="button" onClick={() => setImgFormat(f)}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition uppercase ${
                                  imgFormat === f
                                    ? darkMode ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                                    : darkMode ? "text-slate-400 hover:text-slate-100" : "text-slate-600 hover:text-slate-950"
                                }`}>{f}</button>
                            ))}
                          </div>
                        </div>

                        {/* Resolution */}
                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Resolution</label>
                          <div className="flex gap-2">
                            {([72, 150, 300] as const).map(dpi => (
                              <button key={dpi} type="button" onClick={() => setImgDpi(dpi)}
                                className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${
                                  imgDpi === dpi
                                    ? "border-orange-500 bg-orange-500 text-white"
                                    : darkMode ? "border-slate-700 text-slate-400 hover:border-orange-700 hover:text-orange-300" : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"
                                }`}>
                                {dpi} DPI<br /><span className="text-[10px] font-normal opacity-70">{dpi === 72 ? "Web" : dpi === 150 ? "Medium" : "Print"}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* JPEG quality */}
                        {imgFormat === "jpeg" && (
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                              JPEG Quality — {imgQuality}%
                            </label>
                            <input type="range" min={40} max={100} step={5} value={imgQuality}
                              onChange={e => setImgQuality(Number(e.target.value))} className="w-full" />
                          </div>
                        )}

                        {progress && isProcessing && (
                          <div className={`rounded-lg px-3 py-2 ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                            <div className={`mb-1 flex justify-between text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                              <span>Rendering…</span><span>{progress.done}/{progress.total}</span>
                            </div>
                            <div className={`h-1.5 rounded-full ${darkMode ? "bg-slate-700" : "bg-slate-200"}`}>
                              <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Export</SectionLabel>
                      <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        {globalFile.pageCount != null
                          ? `Exports ${globalFile.pageCount} page${globalFile.pageCount !== 1 ? "s" : ""} as ${imgFormat.toUpperCase()} at ${imgDpi} DPI.${globalFile.pageCount > 1 ? " Multiple pages download as a ZIP." : ""}`
                          : "Each page is exported as an image file."}
                      </p>
                      <button type="button" onClick={handlePdfToImages} disabled={toolDisabled} className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Image size={14} />}
                        {isProcessing ? "Exporting…" : "Export Images"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── IMAGE → PDF ─────────────────────────────────────────────── */}
          {toolMode === "img-to-pdf" && (
            <>
              <div className="lg:col-span-3">
                <Card darkMode={darkMode}>
                  <div className="mb-3 flex items-center justify-between">
                    <SectionLabel darkMode={darkMode}>Images ({imageFiles.length})</SectionLabel>
                    {imageFiles.length > 0 && (
                      <button type="button" onClick={() => setImageFiles([])}
                        className={`text-xs ${darkMode ? "text-slate-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"}`}>
                        Clear all
                      </button>
                    )}
                  </div>
                  <DropZone
                    onFiles={f => setImageFiles(prev => [...prev, ...f])}
                    multiple
                    darkMode={darkMode}
                    compact
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    label="Drop images (PNG, JPG) or click to browse"
                  />
                  {imageFiles.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {imageFiles.map((f, i) => (
                        <ImageChip key={`${f.name}-${i}`} file={f} index={i} total={imageFiles.length} darkMode={darkMode}
                          onRemove={() => setImageFiles(prev => prev.filter((_, j) => j !== i))}
                          onMoveUp={() => moveImage(i, -1)}
                          onMoveDown={() => moveImage(i, 1)}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card darkMode={darkMode}>
                  <SectionLabel darkMode={darkMode}>Convert</SectionLabel>
                  <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Each image becomes one A4 page, centred and scaled to fit.
                  </p>
                  <button type="button" onClick={handleImgToPdf}
                    disabled={imageFiles.length === 0 || isProcessing} className={actionBtn}>
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {isProcessing ? "Converting…" : "Create PDF"}
                  </button>
                </Card>
              </div>
            </>
          )}

          {/* ── WATERMARK ──────────────────────────────────────────────── */}
          {toolMode === "watermark" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Watermark Settings</SectionLabel>
                      <div className="flex flex-col gap-4">

                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Text</label>
                          <input type="text" value={wmText} onChange={e => setWmText(e.target.value)}
                            placeholder="CONFIDENTIAL"
                            className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-600 focus:ring-orange-500/40" : "border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-orange-400/40"}`}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Color</label>
                            <input type="color" value={wmColor} onChange={e => setWmColor(e.target.value)}
                              className="h-9 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0" />
                          </div>
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Font Size — {wmFontSize}pt</label>
                            <input type="range" min={12} max={120} step={4} value={wmFontSize} onChange={e => setWmFontSize(Number(e.target.value))} className="w-full mt-2" />
                          </div>
                        </div>

                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Opacity — {Math.round(wmOpacity * 100)}%</label>
                          <input type="range" min={5} max={100} step={5} value={Math.round(wmOpacity * 100)} onChange={e => setWmOpacity(Number(e.target.value) / 100)} className="w-full" />
                        </div>

                        <div className="flex items-center gap-3">
                          <button type="button" onClick={() => setWmDiagonal(d => !d)}
                            className={`relative flex h-6 w-11 items-center rounded-full transition ${wmDiagonal ? "bg-orange-500" : darkMode ? "bg-slate-700" : "bg-slate-300"}`}>
                            <span className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${wmDiagonal ? "translate-x-6" : "translate-x-1"}`} />
                          </button>
                          <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>Diagonal (45°)</span>
                        </div>

                        <div className={`rounded-xl border px-4 py-3 text-center font-bold ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-50"}`}
                          style={{ color: wmColor, opacity: wmOpacity + 0.2, fontSize: Math.min(wmFontSize * 0.4, 32), transform: wmDiagonal ? "rotate(-10deg)" : undefined }}>
                          {wmText || "WATERMARK"}
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Apply</SectionLabel>
                      <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Stamps the watermark text on every page of the PDF.
                      </p>
                      <button type="button" onClick={handleWatermark} disabled={toolDisabled || !wmText.trim()} className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Stamp size={14} />}
                        {isProcessing ? "Adding…" : "Add Watermark"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── PAGE NUMBERS ────────────────────────────────────────────── */}
          {toolMode === "page-nums" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Page Number Settings</SectionLabel>
                      <div className="flex flex-col gap-4">

                        {/* Position grid */}
                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Position</label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {(["top-left","top-center","top-right","bottom-left","bottom-center","bottom-right"] as PageNumPosition[]).map(pos => (
                              <button key={pos} type="button" onClick={() => setPnPosition(pos)}
                                className={`rounded-lg border py-1.5 text-[10px] font-medium transition ${
                                  pnPosition === pos
                                    ? "border-orange-500 bg-orange-500 text-white"
                                    : darkMode ? "border-slate-700 text-slate-400 hover:border-orange-700 hover:text-orange-300" : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"
                                }`}>
                                {pos.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ")}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Format */}
                        <div>
                          <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Format</label>
                          <div className={`flex gap-1 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
                            {([
                              { id: "n", label: "1, 2, 3" },
                              { id: "page-n", label: "Page 1" },
                              { id: "n-of-total", label: "1 of 10" },
                            ] as const).map(({ id, label }) => (
                              <button key={id} type="button" onClick={() => setPnFormat(id)}
                                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                                  pnFormat === id
                                    ? darkMode ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                                    : darkMode ? "text-slate-400 hover:text-slate-100" : "text-slate-600 hover:text-slate-950"
                                }`}>{label}</button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Color</label>
                            <input type="color" value={pnColor} onChange={e => setPnColor(e.target.value)}
                              className="h-9 w-full cursor-pointer rounded-xl border-0 bg-transparent p-0" />
                          </div>
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Font size — {pnFontSize}pt</label>
                            <input type="range" min={6} max={24} step={1} value={pnFontSize} onChange={e => setPnFontSize(Number(e.target.value))} className="w-full mt-2" />
                          </div>
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Start at</label>
                            <input type="number" value={pnStartAt} min={0} onChange={e => setPnStartAt(Number(e.target.value))}
                              className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 ${darkMode ? "border-slate-700 bg-slate-900 text-slate-100 focus:ring-orange-500/40" : "border-slate-300 bg-white text-slate-900 focus:ring-orange-400/40"}`} />
                          </div>
                          <div>
                            <label className={`mb-1.5 block text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Margin — {pnMargin}pt</label>
                            <input type="range" min={8} max={60} step={2} value={pnMargin} onChange={e => setPnMargin(Number(e.target.value))} className="w-full mt-2" />
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Add Numbers</SectionLabel>
                      <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Adds page numbers to every page at the selected position and format.
                      </p>
                      <button type="button" onClick={handlePageNumbers} disabled={toolDisabled} className={actionBtn}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Hash size={14} />}
                        {isProcessing ? "Adding…" : "Add Page Numbers"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── PASSWORD ────────────────────────────────────────────────── */}
          {toolMode === "password" && (
            <>
              {!globalFile ? (
                <div className="lg:col-span-5"><EmptyState darkMode={darkMode} /></div>
              ) : (
                <>
                  <div className="lg:col-span-3">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Remove Password</SectionLabel>
                      <p className={`text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        If your PDF is password-protected and your browser was able to open it, this tool saves a new copy with the encryption removed — no password needed to open the new file.
                      </p>
                      <div className={`mt-4 rounded-xl px-4 py-3 text-xs leading-relaxed ${darkMode ? "bg-amber-900/20 text-amber-400" : "bg-amber-50 text-amber-700"}`}>
                        <AlertCircle size={12} className="mr-1 inline" />
                        Password <em>adding</em> (encryption) requires a native app — browser security restrictions prevent writing encrypted PDFs.
                      </div>
                    </Card>
                  </div>

                  <div className="lg:col-span-2">
                    <Card darkMode={darkMode}>
                      <SectionLabel darkMode={darkMode}>Unlock</SectionLabel>
                      <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Saves a new copy of the PDF with any password protection stripped.
                      </p>
                      <button type="button" onClick={handlePassword} disabled={toolDisabled}
                        className={`w-full ${btnBase} ${btnDisabled} justify-center py-2.5 bg-emerald-600 hover:bg-emerald-500`}>
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <LockOpen size={14} />}
                        {isProcessing ? "Unlocking…" : "Remove Password"}
                      </button>
                    </Card>
                  </div>
                </>
              )}
            </>
          )}

        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className={`mt-6 border-t pt-3 text-center text-xs ${darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"}`}>
          PDF Tools • v2.0.0 &nbsp;|&nbsp; All processing happens locally in your browser — no files are uploaded.
          <br />
          © {new Date().getFullYear()} PDF Tools. All rights reserved.
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <div
        role="status"
        onClick={() => { if (statusTimerRef.current) clearTimeout(statusTimerRef.current); setStatus(""); }}
        className={`fixed bottom-5 right-5 z-50 max-w-xs cursor-pointer select-none rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-300 ${
          status ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
        } ${
          status.startsWith("❌")
            ? darkMode ? "border-rose-700 bg-rose-950/90 text-rose-300" : "border-rose-200 bg-rose-50 text-rose-700"
            : darkMode ? "border-emerald-700 bg-emerald-950/90 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-700"
        }`}
      >
        {status}
      </div>
    </div>
  );
}

export default App;
