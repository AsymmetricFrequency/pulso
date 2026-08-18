/**
 * Quita los metadatos de una imagen antes de guardarla.
 *
 * Una foto tomada con un teléfono lleva incrustada la **coordenada GPS exacta** de donde se tomó
 * —es decir, de la casa de quien se está registrando—, además del modelo del aparato, la fecha y a
 * veces su número de serie. El registro pide barrio precisamente para no tener la dirección; dejar
 * los EXIF haría inútil esa decisión, porque la ubicación llegaría igual por la puerta de atrás.
 *
 * Se hace sin dependencias: recortar segmentos de un JPEG y trozos de un PNG es leer una cabecera y
 * copiar bytes. Meter una librería de imágenes para esto sería añadir una superficie de ataque que
 * procesa archivos de desconocidos, a cambio de nada.
 */

/** Marcadores JPEG que se descartan: EXIF, XMP, ICC, comentarios y datos de fabricante. */
const JPEG_SEGMENTS_TO_DROP = new Set([
  0xe1, // APP1 — EXIF y XMP, donde va el GPS
  0xe2, // APP2 — ICC
  0xe3,
  0xe4,
  0xe5,
  0xe6,
  0xe7,
  0xe8,
  0xe9,
  0xea,
  0xeb,
  0xec, // APP12 — datos de fabricante
  0xed, // APP13 — IPTC
  0xee, // APP14
  0xef,
  0xfe, // COM — comentario
]);

/** Trozos PNG que se descartan: los de texto y el de EXIF. */
const PNG_CHUNKS_TO_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME"]);

function stripJpeg(input: Buffer): Buffer {
  // SOI. Si no está, no es un JPEG y no se toca: mejor rechazarlo arriba que devolver basura.
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return input;

  const out: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;

  while (offset < input.length - 1) {
    if (input[offset] !== 0xff) break;
    const marker = input[offset + 1] as number;

    // SOS: a partir de aquí vienen los datos comprimidos hasta el final. Se copia tal cual.
    if (marker === 0xda) {
      out.push(input.subarray(offset));
      break;
    }
    // Marcadores sin carga útil.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      out.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    const length = input.readUInt16BE(offset + 2);
    // Una longitud imposible significa un archivo corrupto o manipulado: se corta aquí en vez de
    // seguir leyendo posiciones arbitrarias.
    if (length < 2 || offset + 2 + length > input.length) break;

    if (!JPEG_SEGMENTS_TO_DROP.has(marker)) {
      out.push(input.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }

  return Buffer.concat(out);
}

function stripPng(input: Buffer): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (input.length < 8 || !input.subarray(0, 8).equals(signature)) return input;

  const out: Buffer[] = [input.subarray(0, 8)];
  let offset = 8;

  while (offset + 8 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString("ascii", offset + 4, offset + 8);
    const total = 12 + length; // longitud + tipo + datos + CRC
    if (offset + total > input.length) break;

    if (!PNG_CHUNKS_TO_DROP.has(type)) {
      out.push(input.subarray(offset, offset + total));
    }
    offset += total;
    if (type === "IEND") break;
  }

  return Buffer.concat(out);
}

export type StripResult = { data: Buffer; stripped: boolean; removedBytes: number };

/**
 * Devuelve la imagen sin metadatos y **si de verdad se pudo limpiar**.
 *
 * `stripped: false` no se traga en silencio: la fila guarda ese booleano y una foto sin la marca es
 * una foto que puede llevar la coordenada de la casa de alguien. Es mejor saberlo que suponerlo.
 */
export function stripImageMetadata(input: Buffer, contentType: string): StripResult {
  const data =
    contentType === "image/jpeg"
      ? stripJpeg(input)
      : contentType === "image/png"
        ? stripPng(input)
        : input;

  return {
    data,
    // WebP no se toca: su contenedor RIFF admite trozos EXIF y XMP, y recortarlos a ciegas puede
    // romper la imagen. Se acepta el formato pero se marca como no limpiado, que es lo honesto.
    stripped: contentType === "image/jpeg" || contentType === "image/png",
    removedBytes: input.length - data.length,
  };
}
