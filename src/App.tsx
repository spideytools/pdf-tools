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
} from "lucide-react";

import { PdfEditor } from "./components/PdfEditor";

import { mergePDFs } from "./utils/pdfMerge";
import {
  getPdfPageCount,
  parsePageRanges,
  splitPDFByRanges,
  splitPDFAllPages,
} from "./utils/pdfSplit";
import { rotatePDF } from "./utils/pdfRotate";
import { extractPages } from "./utils/pdfExtract";
import { compressPDF } from "./utils/pdfCompress";
import { downloadFile, formatBytes, stemName } from "./utils/downloader";
import { downloadAsZip } from "./utils/zipDownloader";

type Theme = "dark" | "light";
type ToolMode = "merge" | "split" | "rotate" | "extract" | "compress" | "edit";

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

function uid() {
  return Math.random().toString(36).slice(2);
}

async function readFile(file: File): Promise<PdfFile> {
  const data = await file.arrayBuffer();
  return { id: uid(), name: file.name, size: file.size, data, pageCount: null };
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({
  onFiles,
  multiple,
  darkMode,
  compact,
}: {
  onFiles: (files: File[]) => void;
  multiple: boolean;
  darkMode: boolean;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const pdfs = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdfs.length) onFiles(pdfs);
    },
    [onFiles]
  );

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
          ? darkMode
            ? "border-orange-400 bg-orange-950/30"
            : "border-orange-400 bg-orange-50"
          : darkMode
          ? "border-slate-700 hover:border-slate-500 hover:bg-slate-800/40"
          : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <Upload
        size={compact ? 20 : 28}
        className={dragging ? "text-orange-400" : darkMode ? "text-slate-600" : "text-slate-400"}
      />
      <div className="text-center">
        <p className={`${compact ? "text-xs" : "text-sm"} font-medium ${darkMode ? "text-slate-300" : "text-slate-600"}`}>
          {dragging
            ? "Drop here"
            : multiple
            ? "Drop PDFs or click to browse"
            : "Drop a PDF or click to browse"}
        </p>
        {!compact && (
          <p className={`mt-0.5 text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
            PDF files only
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
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

// ─── File chip ────────────────────────────────────────────────────────────────

function FileChip({
  file,
  darkMode,
  onRemove,
  index,
  total,
  onMoveUp,
  onMoveDown,
  showReorder,
  badge,
}: {
  file: PdfFile;
  darkMode: boolean;
  onRemove?: () => void;
  index: number;
  total: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  showReorder?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
        darkMode ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
      }`}
    >
      {showReorder && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className={`rounded p-0.5 transition disabled:opacity-20 ${
              darkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className={`rounded p-0.5 transition disabled:opacity-20 ${
              darkMode ? "text-slate-500 hover:text-slate-200" : "text-slate-400 hover:text-slate-700"
            }`}
          >
            <ChevronDown size={14} />
          </button>
        </div>
      )}

      <span
        className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
          darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"
        }`}
      >
        {index + 1}
      </span>

      <FileText size={14} className={`shrink-0 ${darkMode ? "text-orange-400" : "text-orange-500"}`} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={`truncate text-sm font-medium ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
            {file.name}
          </p>
          {badge && (
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              darkMode ? "bg-orange-900/60 text-orange-300" : "bg-orange-100 text-orange-600"
            }`}>
              {badge}
            </span>
          )}
        </div>
        <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
          {formatBytes(file.size)}
          {file.pageCount != null
            ? ` · ${file.pageCount} page${file.pageCount !== 1 ? "s" : ""}`
            : " · loading pages…"}
        </p>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={`shrink-0 rounded-lg p-1 transition ${
            darkMode
              ? "text-slate-500 hover:bg-slate-800 hover:text-rose-400"
              : "text-slate-400 hover:bg-slate-100 hover:text-rose-500"
          }`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Range input ──────────────────────────────────────────────────────────────

function RangeInput({
  value,
  onChange,
  placeholder,
  darkMode,
  label,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  darkMode: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={`w-full rounded-xl border px-3 py-2.5 font-mono text-sm outline-none transition focus:ring-2 ${
          darkMode
            ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-600 focus:ring-orange-500/40"
            : "border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:ring-orange-400/40"
        }`}
      />
      {hint && (
        <p className={`text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>{hint}</p>
      )}
    </div>
  );
}

// ─── Empty state (no global file) ────────────────────────────────────────────

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

// ─── Main App ─────────────────────────────────────────────────────────────────

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const darkMode = theme === "dark";

  const [toolMode, setToolMode] = useState<ToolMode>("merge");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Global file (shared by all tools) ──────────────────────────────────────
  const [globalFile, setGlobalFile] = useState<PdfFile | null>(null);

  // ── Merge: extra files to combine with globalFile ──────────────────────────
  const [mergeExtras, setMergeExtras] = useState<PdfFile[]>([]);

  // ── Split ──────────────────────────────────────────────────────────────────
  const [splitMode, setSplitMode] = useState<"all" | "ranges">("all");
  const [splitRanges, setSplitRanges] = useState("");

  // ── Rotate ─────────────────────────────────────────────────────────────────
  const [rotateAngle, setRotateAngle] = useState<90 | 180 | 270>(90);
  const [rotatePages, setRotatePages] = useState("");

  // ── Extract ────────────────────────────────────────────────────────────────
  const [extractRanges, setExtractRanges] = useState("");

  // ── Compress ───────────────────────────────────────────────────────────────
  const [compressResult, setCompressResult] = useState<{ bytes: Uint8Array; size: number } | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("pdf-tools-theme", theme);
  }, [theme]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    statusTimerRef.current = setTimeout(() => setStatus(""), 8000);
  };

  const loadPageCountInto = useCallback(
    async (
      file: PdfFile,
      setter: (updater: (prev: PdfFile | null) => PdfFile | null) => void
    ) => {
      try {
        const count = await getPdfPageCount(file.data);
        setter((prev) => (prev?.id === file.id ? { ...prev, pageCount: count } : prev));
      } catch {
        // ignore
      }
    },
    []
  );

  const loadPageCountIntoList = useCallback(
    async (files: PdfFile[], setter: React.Dispatch<React.SetStateAction<PdfFile[]>>) => {
      for (const file of files) {
        if (file.pageCount != null) continue;
        try {
          const count = await getPdfPageCount(file.data);
          setter((prev) => prev.map((f) => (f.id === file.id ? { ...f, pageCount: count } : f)));
        } catch {
          // ignore
        }
      }
    },
    []
  );

  // ── Global file handlers ───────────────────────────────────────────────────

  const handleGlobalLoad = async (files: File[]) => {
    const f = await readFile(files[0]);
    setGlobalFile(f);
    setCompressResult(null);
    loadPageCountInto(f, setGlobalFile);
  };

  const handleGlobalRemove = () => {
    setGlobalFile(null);
    setMergeExtras([]);
    setCompressResult(null);
    setStatus("");
  };

  // ── Merge ──────────────────────────────────────────────────────────────────

  const handleMergeAddExtras = async (files: File[]) => {
    const newFiles = await Promise.all(files.map(readFile));
    setMergeExtras((prev) => {
      const next = [...prev, ...newFiles];
      loadPageCountIntoList(next, setMergeExtras);
      return next;
    });
  };

  // globalFile is always #1; extras follow
  const mergeAllFiles = globalFile ? [globalFile, ...mergeExtras] : mergeExtras;

  const moveMergeExtra = (i: number, dir: -1 | 1) => {
    // `i` is index in mergeExtras array
    setMergeExtras((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const handleMerge = async () => {
    if (mergeAllFiles.length < 2) return showStatus("❌ Add at least one more PDF to merge");
    setIsProcessing(true);
    try {
      const result = await mergePDFs(mergeAllFiles.map((f) => f.data));
      downloadFile(result, `${stemName(globalFile!.name)}_merged.pdf`);
      showStatus(`✅ Merged ${mergeAllFiles.length} PDFs — ${formatBytes(result.byteLength)}`);
    } catch (e) {
      showStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Split ──────────────────────────────────────────────────────────────────

  const handleSplit = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      let parts: Array<{ bytes: Uint8Array; filename: string }>;
      const base = stemName(globalFile.name);

      if (splitMode === "all") {
        parts = await splitPDFAllPages(globalFile.data);
      } else {
        if (!splitRanges.trim()) { showStatus("❌ Enter page ranges to split"); return; }
        const ranges = parsePageRanges(splitRanges, globalFile.pageCount ?? 9999);
        parts = await splitPDFByRanges(globalFile.data, ranges);
      }

      if (parts.length === 1) {
        downloadFile(parts[0].bytes, `${base}_${parts[0].filename}`);
      } else {
        await downloadAsZip(
          parts.map((p) => ({ bytes: p.bytes, filename: `${base}_${p.filename}` })),
          `${base}_split.zip`
        );
      }
      showStatus(`✅ Split into ${parts.length} file${parts.length !== 1 ? "s" : ""}`);
    } catch (e) {
      showStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Rotate ─────────────────────────────────────────────────────────────────

  const handleRotate = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const result = await rotatePDF(
        globalFile.data,
        rotateAngle,
        rotatePages,
        globalFile.pageCount ?? 9999
      );
      downloadFile(result, `${stemName(globalFile.name)}_rotated.pdf`);
      const pagesDesc = rotatePages.trim() ? `pages ${rotatePages}` : "all pages";
      showStatus(`✅ Rotated ${pagesDesc} by ${rotateAngle}°`);
    } catch (e) {
      showStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Extract ────────────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!globalFile || !extractRanges.trim()) return;
    setIsProcessing(true);
    try {
      const result = await extractPages(
        globalFile.data,
        extractRanges,
        globalFile.pageCount ?? 9999
      );
      downloadFile(result, `${stemName(globalFile.name)}_extracted.pdf`);
      showStatus(`✅ Extracted pages ${extractRanges} — ${formatBytes(result.byteLength)}`);
    } catch (e) {
      showStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Compress ───────────────────────────────────────────────────────────────

  const handleCompress = async () => {
    if (!globalFile) return;
    setIsProcessing(true);
    try {
      const bytes = await compressPDF(globalFile.data);
      setCompressResult({ bytes, size: bytes.byteLength });
      const saved = globalFile.size - bytes.byteLength;
      const pct = ((saved / globalFile.size) * 100).toFixed(1);
      showStatus(saved > 0 ? `✅ Saved ${formatBytes(saved)} (${pct}%)` : "✅ Re-serialized — already optimized");
    } catch (e) {
      showStatus(`❌ ${(e as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompressDownload = () => {
    if (!globalFile || !compressResult) return;
    downloadFile(compressResult.bytes, `${stemName(globalFile.name)}_compressed.pdf`);
    showStatus("⬇️ Download started");
  };

  // ── Shared styles ──────────────────────────────────────────────────────────

  const btnBase = "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition";
  const btnDisabled = "disabled:cursor-not-allowed disabled:opacity-40";

  const tools: { id: ToolMode; label: string; Icon: typeof Layers }[] = [
    { id: "merge",    label: "Merge",    Icon: Layers },
    { id: "split",    label: "Split",    Icon: Scissors },
    { id: "rotate",   label: "Rotate",   Icon: RotateCw },
    { id: "extract",  label: "Extract",  Icon: FileOutput },
    { id: "compress", label: "Compress", Icon: Minimize2 },
    { id: "edit",     label: "Edit",     Icon: PenLine },
  ];

  const toolDisabled = !globalFile || isProcessing;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div data-theme={theme} className="app-shell min-h-screen w-full transition-colors duration-300">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 lg:px-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-red-400 via-orange-300 to-rose-500 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(239,68,68,0.35)] md:text-3xl">
              PDF Tools
            </h1>
            <p className={`mt-0.5 text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Merge, split, rotate, extract and compress PDFs — all in your browser.
            </p>
          </div>

          <div
            role="group"
            aria-label="Theme"
            className={`flex shrink-0 overflow-hidden rounded-xl border p-1 transition ${
              darkMode ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-white"
            }`}
          >
            <button
              type="button"
              onClick={() => setTheme("light")}
              title="Light mode"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                !darkMode ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              }`}
            >
              <Sun size={13} />Light
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              title="Dark mode"
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                darkMode ? "bg-white text-slate-950" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              }`}
            >
              <Moon size={13} />Dark
            </button>
          </div>
        </div>

        {/* ── Global file zone ───────────────────────────────────────────── */}
        <div className={`mb-4 rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
              PDF File
            </h2>
            {globalFile && (
              <button
                type="button"
                onClick={handleGlobalRemove}
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  darkMode ? "text-slate-400 hover:bg-slate-800 hover:text-rose-400" : "text-slate-500 hover:bg-slate-100 hover:text-rose-500"
                }`}
              >
                <Trash2 size={12} />Remove
              </button>
            )}
          </div>

          {globalFile ? (
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              darkMode ? "border-orange-800/50 bg-orange-950/20" : "border-orange-200 bg-orange-50/60"
            }`}>
              <FileText size={18} className={darkMode ? "text-orange-400" : "text-orange-500"} />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
                  {globalFile.name}
                </p>
                <p className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                  {formatBytes(globalFile.size)}
                  {globalFile.pageCount != null
                    ? ` · ${globalFile.pageCount} page${globalFile.pageCount !== 1 ? "s" : ""}`
                    : " · counting pages…"}
                </p>
              </div>
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            </div>
          ) : (
            <DropZone onFiles={handleGlobalLoad} multiple={false} darkMode={darkMode} />
          )}
        </div>

        {/* ── Tool tabs ──────────────────────────────────────────────────── */}
        <div className={`mb-4 flex flex-wrap gap-1 rounded-xl border p-1.5 ${
          darkMode ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/90"
        }`}>
          {tools.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { if (!isProcessing) { setToolMode(id); setStatus(""); } }}
              aria-pressed={toolMode === id}
              disabled={isProcessing && toolMode !== id}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition ${
                toolMode === id
                  ? "bg-orange-500 text-white shadow-sm"
                  : isProcessing
                  ? darkMode ? "cursor-not-allowed text-slate-700" : "cursor-not-allowed text-slate-300"
                  : !globalFile && id !== "merge"
                  ? darkMode ? "text-slate-600 hover:text-slate-500" : "text-slate-300 hover:text-slate-400"
                  : darkMode
                  ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tool content ───────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-5">

          {/* ── MERGE ──────────────────────────────────────────────────── */}
          {toolMode === "merge" && (
            <>
              <div className="flex flex-col gap-4 lg:col-span-3">
                {/* Extra files drop zone */}
                <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                      Add More PDFs
                    </h2>
                    {mergeExtras.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMergeExtras([])}
                        className={`text-xs ${darkMode ? "text-slate-500 hover:text-rose-400" : "text-slate-400 hover:text-rose-500"}`}
                      >
                        Clear extras
                      </button>
                    )}
                  </div>
                  <DropZone onFiles={handleMergeAddExtras} multiple darkMode={darkMode} compact />
                </div>

                {/* Merge order list */}
                {mergeAllFiles.length > 0 && (
                  <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Merge Order ({mergeAllFiles.length} files)
                      </h2>
                      <span className={`text-xs ${darkMode ? "text-slate-600" : "text-slate-400"}`}>
                        {formatBytes(mergeAllFiles.reduce((s, f) => s + f.size, 0))} total
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {/* Global file — pinned first, no reorder arrows */}
                      {globalFile && (
                        <FileChip
                          file={globalFile}
                          darkMode={darkMode}
                          index={0}
                          total={mergeAllFiles.length}
                          badge="main"
                        />
                      )}
                      {/* Extra files — reorderable and removable */}
                      {mergeExtras.map((f, i) => (
                        <FileChip
                          key={f.id}
                          file={f}
                          darkMode={darkMode}
                          index={i + (globalFile ? 1 : 0)}
                          total={mergeAllFiles.length}
                          showReorder
                          onMoveUp={() => moveMergeExtra(i, -1)}
                          onMoveDown={() => moveMergeExtra(i, 1)}
                          onRemove={() => setMergeExtras((prev) => prev.filter((x) => x.id !== f.id))}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-2">
                <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                  <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    Merge
                  </h2>
                  <p className={`mb-4 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                    {!globalFile
                      ? "Upload a PDF above first, then add more PDFs here to combine."
                      : mergeExtras.length === 0
                      ? "Add at least one more PDF to merge with the main file."
                      : `Ready to merge ${mergeAllFiles.length} PDFs. Use ↑↓ to adjust order.`}
                  </p>
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={mergeAllFiles.length < 2 || isProcessing}
                    className={`w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`}
                  >
                    {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}
                    {isProcessing ? "Merging…" : "Merge PDFs"}
                  </button>
                </div>
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
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Split Mode
                      </h2>
                      <div className={`flex gap-1 rounded-lg border p-0.5 ${darkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
                        {(["all", "ranges"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSplitMode(m)}
                            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                              splitMode === m
                                ? darkMode ? "bg-white text-slate-950" : "bg-slate-900 text-white"
                                : darkMode ? "text-slate-400 hover:text-slate-100" : "text-slate-600 hover:text-slate-950"
                            }`}
                          >
                            {m === "all" ? "Every page" : "By ranges"}
                          </button>
                        ))}
                      </div>

                      {splitMode === "ranges" ? (
                        <div className="mt-4">
                          <RangeInput
                            label="Page ranges"
                            value={splitRanges}
                            onChange={setSplitRanges}
                            placeholder="1-3, 5, 7-9"
                            darkMode={darkMode}
                            hint="Each range becomes a separate PDF, bundled into a ZIP."
                          />
                        </div>
                      ) : (
                        <p className={`mt-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Each page is saved as its own PDF. Multiple files are downloaded as a ZIP archive.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Split
                      </h2>
                      {globalFile.pageCount != null && (
                        <p className={`mb-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {globalFile.pageCount} pages available to split.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={handleSplit}
                        disabled={toolDisabled}
                        className={`w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`}
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />}
                        {isProcessing ? "Splitting…" : "Split PDF"}
                      </button>
                    </div>
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
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Rotation Angle
                      </h2>
                      <div className="flex gap-2">
                        {([90, 180, 270] as const).map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            onClick={() => setRotateAngle(deg)}
                            className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold transition ${
                              rotateAngle === deg
                                ? "border-orange-500 bg-orange-500 text-white"
                                : darkMode
                                ? "border-slate-700 text-slate-400 hover:border-orange-700 hover:text-orange-300"
                                : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"
                            }`}
                          >
                            <RotateCw size={18} style={{ transform: deg === 270 ? "scaleX(-1)" : deg === 180 ? "rotate(180deg)" : undefined }} />
                            {deg === 90 ? "90° CW" : deg === 180 ? "180°" : "90° CCW"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Pages & Rotate
                      </h2>
                      <RangeInput
                        label="Pages (blank = all)"
                        value={rotatePages}
                        onChange={setRotatePages}
                        placeholder="1-3, 5 — or leave blank"
                        darkMode={darkMode}
                        hint="Leave empty to rotate every page."
                      />
                      <button
                        type="button"
                        onClick={handleRotate}
                        disabled={toolDisabled}
                        className={`mt-3 w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`}
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
                        {isProcessing ? "Rotating…" : "Rotate & Download"}
                      </button>
                    </div>
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
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <RangeInput
                        label="Pages to extract"
                        value={extractRanges}
                        onChange={setExtractRanges}
                        placeholder="1, 3-5, 8"
                        darkMode={darkMode}
                        hint="Selected pages are saved in the specified order into a new PDF."
                      />

                      {extractRanges.trim() && globalFile.pageCount != null && (() => {
                        try {
                          const ranges = parsePageRanges(extractRanges, globalFile.pageCount);
                          const count = ranges.reduce((s, r) => s + (r.end - r.start + 1), 0);
                          return (
                            <p className={`mt-2 text-xs font-medium ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>
                              <CheckCircle2 size={12} className="mr-1 inline" />
                              {count} page{count !== 1 ? "s" : ""} will be extracted
                            </p>
                          );
                        } catch (e) {
                          return (
                            <p className={`mt-2 text-xs font-medium ${darkMode ? "text-rose-400" : "text-rose-600"}`}>
                              <AlertCircle size={12} className="mr-1 inline" />
                              {(e as Error).message}
                            </p>
                          );
                        }
                      })()}
                    </div>
                  </div>

                  <div className="lg:col-span-2">
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Extract
                      </h2>
                      {globalFile.pageCount != null && (
                        <p className={`mb-3 text-xs ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {globalFile.pageCount} pages available.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={handleExtract}
                        disabled={toolDisabled || !extractRanges.trim()}
                        className={`w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`}
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
                        {isProcessing ? "Extracting…" : "Extract Pages"}
                      </button>
                    </div>
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
                  {/* Action panel — first on mobile, right column on desktop */}
                  <div className="order-1 lg:order-2 lg:col-span-2">
                    <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                      <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Compress
                      </h2>
                      <p className={`mb-3 text-xs leading-relaxed ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                        Re-serializes with object streams to remove redundant data and reduce file size.
                      </p>
                      <button
                        type="button"
                        onClick={handleCompress}
                        disabled={toolDisabled}
                        className={`w-full ${btnBase} ${btnDisabled} justify-center bg-orange-600 hover:bg-orange-500 py-2.5`}
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Minimize2 size={14} />}
                        {isProcessing ? "Compressing…" : "Compress PDF"}
                      </button>
                    </div>
                  </div>

                  {/* Result panel — second on mobile (below button), left column on desktop */}
                  <div className="order-2 lg:order-1 lg:col-span-3">
                    {compressResult && (
                      <div className={`rounded-xl border p-4 ${darkMode ? "border-slate-800 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                        <h2 className={`mb-3 text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Result
                        </h2>
                        <div className="flex flex-col gap-2">
                          <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${darkMode ? "bg-slate-800" : "bg-slate-50"}`}>
                            <span className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>Original</span>
                            <span className={`font-mono text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-800"}`}>
                              {formatBytes(globalFile.size)}
                            </span>
                          </div>
                          <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                            darkMode ? "border-emerald-800/60 bg-emerald-950/40" : "border-emerald-200 bg-emerald-50"
                          }`}>
                            <span className={`text-xs font-medium ${darkMode ? "text-emerald-400" : "text-emerald-600"}`}>Compressed</span>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-sm font-semibold ${darkMode ? "text-emerald-300" : "text-emerald-700"}`}>
                                {formatBytes(compressResult.size)}
                              </span>
                              {compressResult.size < globalFile.size && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  darkMode ? "bg-emerald-900 text-emerald-300" : "bg-emerald-100 text-emerald-700"
                                }`}>
                                  -{(((globalFile.size - compressResult.size) / globalFile.size) * 100).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleCompressDownload}
                          className={`mt-3 w-full ${btnBase} justify-center bg-emerald-600 hover:bg-emerald-500 py-2.5`}
                        >
                          <Download size={14} />Download Compressed
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── EDIT ───────────────────────────────────────────────────── */}
          {toolMode === "edit" && (
            <div className="lg:col-span-5">
              {!globalFile ? (
                <EmptyState darkMode={darkMode} />
              ) : (
                <PdfEditor file={globalFile} darkMode={darkMode} onStatus={showStatus} />
              )}
            </div>
          )}

        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className={`mt-6 border-t pt-3 text-center text-xs ${darkMode ? "border-slate-800 text-slate-600" : "border-slate-200 text-slate-400"}`}>
          PDF Tools • v1.0.0 &nbsp;|&nbsp; All processing happens locally in your browser — no files are uploaded.
          <br />
          © {new Date().getFullYear()} PDF Tools. All rights reserved.
        </div>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
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
