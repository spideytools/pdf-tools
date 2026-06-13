import { PDFDocument } from "pdf-lib";
import { loadPdfDoc } from "./pdfRender";

export type CompressMode = "lossless" | "medium" | "high";

const MODE_CONFIG: Record<
  Exclude<CompressMode, "lossless">,
  { width: number; quality: number }
> = {
  medium: { width: 1200, quality: 0.80 },
  high:   { width: 900,  quality: 0.65 },
};

export async function compressPDF(
  data: ArrayBuffer,
  mode: CompressMode = "lossless",
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  if (mode === "lossless") {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    return doc.save({ useObjectStreams: true });
  }

  const { width: targetWidth, quality } = MODE_CONFIG[mode];
  const srcDoc = await loadPdfDoc(data);
  const newDoc = await PDFDocument.create();

  for (let i = 0; i < srcDoc.numPages; i++) {
    const page = await srcDoc.getPage(i + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = targetWidth / vp1.width;
    const vp = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(vp.width);
    canvas.height = Math.round(vp.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();

    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
        "image/jpeg",
        quality
      )
    );
    const buf = await blob.arrayBuffer();
    const img = await newDoc.embedJpg(buf);

    const newPage = newDoc.addPage([vp1.width, vp1.height]);
    newPage.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });

    onProgress?.(i + 1, srcDoc.numPages);
  }

  await srcDoc.destroy();
  return newDoc.save();
}
