import { PDFDocument } from "pdf-lib";

const A4_W = 595.28;
const A4_H = 841.89;

export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (const file of files) {
    const buf = await file.arrayBuffer();
    const name = file.name.toLowerCase();
    const isPng = file.type === "image/png" || name.endsWith(".png");

    const img = isPng ? await doc.embedPng(buf) : await doc.embedJpg(buf);
    const { width: iw, height: ih } = img;

    // Fit to A4, never upscale
    const scale = Math.min(A4_W / iw, A4_H / ih, 1);
    const drawW = iw * scale;
    const drawH = ih * scale;

    const page = doc.addPage([A4_W, A4_H]);
    page.drawImage(img, {
      x: (A4_W - drawW) / 2,
      y: (A4_H - drawH) / 2,
      width: drawW,
      height: drawH,
    });
  }

  return doc.save();
}
