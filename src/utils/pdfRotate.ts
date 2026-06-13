import { PDFDocument, degrees } from "pdf-lib";
import { parsePageRanges } from "./pdfSplit";

export async function rotatePDF(
  data: ArrayBuffer,
  rotationDeg: number,
  pagesInput: string,
  totalPages: number
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = doc.getPages();

  let indices: number[];
  if (!pagesInput.trim()) {
    indices = pages.map((_, i) => i);
  } else {
    const ranges = parsePageRanges(pagesInput, totalPages);
    const set = new Set<number>();
    ranges.forEach((r) => {
      for (let i = r.start; i <= r.end; i++) set.add(i - 1);
    });
    indices = Array.from(set).sort((a, b) => a - b);
  }

  for (const idx of indices) {
    const page = pages[idx];
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + rotationDeg + 360) % 360));
  }

  return doc.save();
}
