import { PDFDocument } from "pdf-lib";
import { parsePageRanges } from "./pdfSplit";

export async function extractPages(
  data: ArrayBuffer,
  pagesInput: string,
  totalPages: number
): Promise<Uint8Array> {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const out = await PDFDocument.create();

  const ranges = parsePageRanges(pagesInput, totalPages);
  const indices: number[] = [];
  ranges.forEach((r) => {
    for (let i = r.start; i <= r.end; i++) indices.push(i - 1);
  });

  if (indices.length === 0) throw new Error("No pages selected");

  const pages = await out.copyPages(src, indices);
  pages.forEach((p) => out.addPage(p));

  return out.save();
}
