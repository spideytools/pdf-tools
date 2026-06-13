import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";

function hexToRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  color: string;
  opacity: number;
  diagonal: boolean;
}

export async function addWatermark(
  data: ArrayBuffer,
  opts: WatermarkOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const [r, g, b] = hexToRgb(opts.color);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);

    page.drawText(opts.text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: opts.fontSize,
      font,
      color: rgb(r, g, b),
      opacity: opts.opacity,
      rotate: opts.diagonal ? degrees(45) : degrees(0),
    });
  }

  return doc.save();
}
