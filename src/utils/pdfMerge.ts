import { PDFDocument } from "pdf-lib";

export async function mergePDFs(files: ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const data of files) {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true });
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  return merged.save();
}
