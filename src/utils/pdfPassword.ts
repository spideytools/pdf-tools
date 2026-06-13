import { PDFDocument } from "pdf-lib";

export async function unlockPDF(data: ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  return doc.save();
}
