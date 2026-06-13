import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

function hexToRgb(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

export type PageNumPosition =
  | "bottom-left" | "bottom-center" | "bottom-right"
  | "top-left"    | "top-center"    | "top-right";

export type PageNumFormat = "n" | "page-n" | "n-of-total";

export interface PageNumberOptions {
  position: PageNumPosition;
  format: PageNumFormat;
  fontSize: number;
  color: string;
  startAt: number;
  margin: number;
}

export async function addPageNumbers(
  data: ArrayBuffer,
  opts: PageNumberOptions
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [r, g, b] = hexToRgb(opts.color);
  const pages = doc.getPages();
  const total = pages.length;

  for (let i = 0; i < total; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const n = i + opts.startAt;

    let label: string;
    if (opts.format === "page-n")       label = `Page ${n}`;
    else if (opts.format === "n-of-total") label = `${n} of ${total + opts.startAt - 1}`;
    else                                   label = String(n);

    const textW = font.widthOfTextAtSize(label, opts.fontSize);
    const isTop   = opts.position.startsWith("top");
    const isRight = opts.position.endsWith("right");
    const isLeft  = opts.position.endsWith("left");

    const x = isRight ? width - textW - opts.margin : isLeft ? opts.margin : (width - textW) / 2;
    const y = isTop ? height - opts.margin - opts.fontSize : opts.margin;

    page.drawText(label, { x, y, size: opts.fontSize, font, color: rgb(r, g, b) });
  }

  return doc.save();
}
