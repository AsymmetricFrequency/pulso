import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "./strip-image-metadata.js";

/**
 * Un JPEG mínimo con un APP1 (EXIF) que lleva una coordenada dentro.
 *
 * Se construye a mano en vez de usar una foto real porque lo que hay que comprobar es exactamente
 * esto: que la cadena que va en el segmento EXIF **no sobreviva**. Con una foto real de un
 * repositorio, un fallo silencioso pasaría desapercibido.
 */
function jpegConExif(secreto: string): Buffer {
  const soi = Buffer.from([0xff, 0xd8]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), Buffer.from(secreto, "ascii")]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    (() => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(payload.length + 2);
      return length;
    })(),
    payload,
  ]);
  // Un segmento que sí debe conservarse, para comprobar que no se recorta de más.
  const dqt = Buffer.concat([Buffer.from([0xff, 0xdb]), Buffer.from([0x00, 0x03, 0x00])]);
  const sos = Buffer.from([0xff, 0xda, 0x00, 0x03, 0x00, 0x11, 0x22, 0x33]);
  return Buffer.concat([soi, app1, dqt, sos]);
}

describe("stripImageMetadata", () => {
  // La razón entera de que este módulo exista: la foto de una casa lleva la coordenada de esa casa,
  // y el registro pide barrio justamente para no tener la dirección.
  it("borra la coordenada que el teléfono deja incrustada en el JPEG", () => {
    const original = jpegConExif("GPSLatitude=4.7025;GPSLongitude=-75.7369");
    expect(original.toString("latin1")).toContain("GPSLatitude");

    const { data, stripped, removedBytes } = stripImageMetadata(original, "image/jpeg");

    expect(stripped).toBe(true);
    expect(removedBytes).toBeGreaterThan(0);
    expect(data.toString("latin1")).not.toContain("GPSLatitude");
    expect(data.toString("latin1")).not.toContain("Exif");
  });

  it("conserva la imagen: no recorta los segmentos que la hacen legible", () => {
    const { data } = stripImageMetadata(jpegConExif("x"), "image/jpeg");
    // SOI al principio, la tabla de cuantización intacta y los datos comprimidos al final.
    expect(data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(data.includes(Buffer.from([0xff, 0xdb]))).toBe(true);
    expect(data.includes(Buffer.from([0xff, 0xda]))).toBe(true);
  });

  it("quita los trozos de texto y EXIF de un PNG", () => {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const chunk = (type: string, body: string) => {
      const data = Buffer.from(body, "ascii");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(data.length);
      return Buffer.concat([length, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
    };
    const png = Buffer.concat([
      signature,
      chunk("IHDR", "abcd"),
      chunk("tEXt", "Comment=calle 5 numero 12-34"),
      chunk("IEND", ""),
    ]);

    const { data } = stripImageMetadata(png, "image/png");
    expect(data.toString("latin1")).not.toContain("calle 5");
    expect(data.toString("latin1")).toContain("IHDR");
    expect(data.toString("latin1")).toContain("IEND");
  });

  // No mentir sobre lo que se hizo importa más que hacerlo: la fila guarda este booleano, y una
  // foto marcada como no limpiada es una foto que un auditor sabe tratar con cuidado.
  it("dice que NO limpió cuando el formato no se puede recortar a ciegas", () => {
    const webp = Buffer.from("RIFF....WEBP", "ascii");
    const { stripped, data } = stripImageMetadata(webp, "image/webp");
    expect(stripped).toBe(false);
    expect(data).toEqual(webp);
  });

  it("no rompe un archivo corrupto: lo devuelve tal cual en vez de leer fuera de rango", () => {
    const basura = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]);
    expect(() => stripImageMetadata(basura, "image/jpeg")).not.toThrow();
  });
});
