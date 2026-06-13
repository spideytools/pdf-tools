import { loadPdfDoc } from "./pdfRender";

export type ImageFormat = "png" | "jpeg";
export type ImageDpi = 72 | 150 | 300;

const DPI_WIDTH: Record<ImageDpi, number> = { 72: 595, 150: 1240, 300: 2480 };

export async function pdfToImages(
  data: ArrayBuffer,
  format: ImageFormat,
  dpi: ImageDpi,
  jpegQuality: number,
  onProgress?: (done: number, total: number) => void
): Promise<Array<{ blob: Blob; filename: string }>> {
  const doc = await loadPdfDoc(data);
  const targetWidth = DPI_WIDTH[dpi];
  const results: Array<{ blob: Blob; filename: string }> = [];

  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = targetWidth / vp1.width;
    const vp = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(vp.width);
    canvas.height = Math.round(vp.height);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();

    const mime = format === "png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob(
        (b) => (b ? res(b) : rej(new Error("toBlob failed"))),
        mime,
        format === "jpeg" ? jpegQuality / 100 : undefined
      )
    );

    const pad = String(i + 1).padStart(3, "0");
    results.push({ blob, filename: `page_${pad}.${format}` });
    onProgress?.(i + 1, doc.numPages);
  }

  await doc.destroy();
  return results;
}
