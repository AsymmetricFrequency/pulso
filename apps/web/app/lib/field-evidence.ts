import type { FieldEvidenceInput } from "./offline-visit-queue";

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const canvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("No fue posible comprimir la imagen"))),
      "image/jpeg",
      0.72,
    );
  });

export async function prepareFieldEvidence(
  file: File,
  assessmentClientMutationId: string,
): Promise<FieldEvidenceInput> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible procesar la imagen");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const compressed = await canvasBlob(canvas);
  if (compressed.size > 5 * 1024 * 1024) throw new Error("La imagen sigue siendo demasiado grande");
  const bytes = await compressed.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return {
    clientMutationId: crypto.randomUUID(),
    assessmentClientMutationId,
    fileName: `evidencia-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`,
    contentType: "image/jpeg",
    byteSize: compressed.size,
    sha256,
    capturedAt: new Date().toISOString(),
    dataBase64: await toBase64(compressed),
  };
}
