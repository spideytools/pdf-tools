export function downloadFile(
  data: Uint8Array,
  filename: string,
  mimeType = "application/pdf"
) {
  const blob = new Blob([data.slice(0)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function stemName(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}
