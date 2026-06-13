import { PDFDocument } from "pdf-lib";

export interface PageRange {
  start: number; // 1-indexed
  end: number;   // 1-indexed, inclusive
}

export function parsePageRanges(input: string, maxPages: number): PageRange[] {
  if (!input.trim()) return [];
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  const ranges: PageRange[] = [];

  for (const part of parts) {
    const dash = part.match(/^(\d+)\s*-\s*(\d+)$/);
    const single = part.match(/^(\d+)$/);

    if (dash) {
      const start = parseInt(dash[1]);
      const end = parseInt(dash[2]);
      if (start < 1 || end > maxPages || start > end)
        throw new Error(`Invalid range "${part}" — document has ${maxPages} pages`);
      ranges.push({ start, end });
    } else if (single) {
      const page = parseInt(single[1]);
      if (page < 1 || page > maxPages)
        throw new Error(`Page ${page} is out of range — document has ${maxPages} pages`);
      ranges.push({ start: page, end: page });
    } else {
      throw new Error(`Cannot parse "${part}" — use "1-3" or "5"`);
    }
  }

  if (ranges.length === 0) throw new Error("No valid page ranges specified");
  return ranges;
}

export async function getPdfPageCount(data: ArrayBuffer): Promise<number> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  return doc.getPageCount();
}

export async function splitPDFByRanges(
  data: ArrayBuffer,
  ranges: PageRange[]
): Promise<Array<{ bytes: Uint8Array; filename: string }>> {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const results: Array<{ bytes: Uint8Array; filename: string }> = [];

  for (const r of ranges) {
    const out = await PDFDocument.create();
    const indices = Array.from({ length: r.end - r.start + 1 }, (_, i) => r.start - 1 + i);
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    const filename = r.start === r.end ? `page_${r.start}.pdf` : `pages_${r.start}-${r.end}.pdf`;
    results.push({ bytes: await out.save(), filename });
  }

  return results;
}

export async function splitPDFAllPages(
  data: ArrayBuffer
): Promise<Array<{ bytes: Uint8Array; filename: string }>> {
  const src = await PDFDocument.load(data, { ignoreEncryption: true });
  const count = src.getPageCount();
  const results: Array<{ bytes: Uint8Array; filename: string }> = [];

  for (let i = 0; i < count; i++) {
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(src, [i]);
    out.addPage(page);
    results.push({ bytes: await out.save(), filename: `page_${i + 1}.pdf` });
  }

  return results;
}
