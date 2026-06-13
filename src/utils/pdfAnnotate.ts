import { PDFDocument, rgb, StandardFonts, LineCapStyle } from "pdf-lib";

// ─── Annotation types ─────────────────────────────────────────────────────────

export interface BaseAnnotation {
  id: string;
  page: number; // 0-indexed
  color: string; // #RRGGBB
  opacity: number; // 0–1
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  x: number; // fraction 0–1, top-left origin
  y: number;
  text: string;
  fontSize: number;
}

export interface RectAnnotation extends BaseAnnotation {
  type: "highlight" | "whiteout" | "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth?: number;
}

export interface DrawAnnotation extends BaseAnnotation {
  type: "draw";
  x: number; // unused — kept for union compatibility
  y: number;
  points: [number, number][]; // fractions 0–1
  strokeWidth: number;
}

export type Annotation = TextAnnotation | RectAnnotation | DrawAnnotation;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hex(h: string): [number, number, number] {
  return [
    parseInt(h.slice(1, 3), 16) / 255,
    parseInt(h.slice(3, 5), 16) / 255,
    parseInt(h.slice(5, 7), 16) / 255,
  ];
}

// ─── Apply to PDF ─────────────────────────────────────────────────────────────

export async function applyAnnotations(
  data: ArrayBuffer,
  annotations: Annotation[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, { ignoreEncryption: true });
  const pages = doc.getPages();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const ann of annotations) {
    const page = pages[ann.page];
    if (!page) continue;

    const { width: W, height: H } = page.getSize();
    const [r, g, b] = hex(ann.color);
    const op = ann.opacity;

    switch (ann.type) {
      case "text": {
        const fs = ann.fontSize;
        // Fractional top-left → pdf-lib bottom-left (flip Y), shift up by font size
        page.drawText(ann.text, {
          x: ann.x * W,
          y: (1 - ann.y) * H - fs,
          size: fs,
          font,
          color: rgb(r, g, b),
          opacity: op,
        });
        break;
      }

      case "highlight": {
        page.drawRectangle({
          x: ann.x * W,
          y: (1 - ann.y - ann.height) * H,
          width: ann.width * W,
          height: ann.height * H,
          color: rgb(r, g, b),
          opacity: op,
        });
        break;
      }

      case "whiteout": {
        page.drawRectangle({
          x: ann.x * W,
          y: (1 - ann.y - ann.height) * H,
          width: ann.width * W,
          height: ann.height * H,
          color: rgb(1, 1, 1),
          opacity: 1,
        });
        break;
      }

      case "rect": {
        page.drawRectangle({
          x: ann.x * W,
          y: (1 - ann.y - ann.height) * H,
          width: ann.width * W,
          height: ann.height * H,
          borderColor: rgb(r, g, b),
          borderWidth: ann.strokeWidth ?? 2,
          opacity: op,
        });
        break;
      }

      case "draw": {
        if (ann.points.length < 2) break;
        for (let i = 0; i < ann.points.length - 1; i++) {
          const [x1, y1] = ann.points[i];
          const [x2, y2] = ann.points[i + 1];
          page.drawLine({
            start: { x: x1 * W, y: (1 - y1) * H },
            end:   { x: x2 * W, y: (1 - y2) * H },
            thickness: ann.strokeWidth,
            color: rgb(r, g, b),
            opacity: op,
            lineCap: LineCapStyle.Round,
          });
        }
        break;
      }
    }
  }

  return doc.save();
}
