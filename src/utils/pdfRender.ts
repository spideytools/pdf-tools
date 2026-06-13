import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Worker resolved by Vite at build time → copied to dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

export type PdfDoc = PDFDocumentProxy;

export interface RenderedPage {
  dataUrl: string;
  widthPx: number;
  heightPx: number;
}

export async function loadPdfDoc(data: ArrayBuffer): Promise<PdfDoc> {
  return pdfjsLib.getDocument({ data: data.slice(0) }).promise;
}

export async function renderPageToDataUrl(
  doc: PdfDoc,
  pageIndex: number, // 0-based
  targetWidth: number
): Promise<RenderedPage> {
  const page = await doc.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = targetWidth / vp1.width;
  const vp = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2D context");

  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  page.cleanup();

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.92),
    widthPx: canvas.width,
    heightPx: canvas.height,
  };
}
