// Hand a file to the browser as a download. No address leaves the device.

export function downloadBytes(filename: string, bytes: Uint8Array | string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const downloadText = (filename: string, text: string, type = "text/plain"): void => downloadBytes(filename, text, `${type};charset=utf-8`);
