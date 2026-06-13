import JSZip from "jszip";
import { downloadFile } from "./downloader";

export async function downloadAsZip(
  files: Array<{ bytes: Uint8Array; filename: string }>,
  zipName: string
) {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.filename, f.bytes);
  }
  const out = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  downloadFile(out, zipName, "application/zip");
}
