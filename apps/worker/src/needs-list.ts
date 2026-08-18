// `CommunityReportMetadata.needs` acepta hasta 40 elementos de 400 caracteres cada uno. Los cinco
// importadores construían la lista por su cuenta y todos limitaban la cantidad de elementos pero
// ninguno su longitud, así que bastaba que una persona escribiera un párrafo largo sin comas para
// que la fila no pasara el esquema — y como la ruta pública valida el lote entero con `.parse()`,
// una sola fila mala dejaba sin lista a las 2.300 buenas.
//
// La lección es la misma del disparador de redacción: si la invariante depende de que cada autor
// se acuerde, no es una invariante. Todo importador que arme `needs` pasa por aquí.
const MAX_ITEMS = 40;
const MAX_LENGTH = 400;

export function toNeedsList(
  raw: string | null | undefined,
  separator: RegExp | string,
): string[] | undefined {
  if (!raw) return undefined;
  const items = normalizeNeeds(raw.split(separator));
  return items.length > 0 ? items : undefined;
}

// Para las fuentes que ya llegan con la lista partida.
export function normalizeNeeds(items: readonly (string | null | undefined)[]): string[] {
  return items
    .map((item) => item?.trim() ?? "")
    .filter(Boolean)
    .map((item) => (item.length > MAX_LENGTH ? `${item.slice(0, MAX_LENGTH - 1)}…` : item))
    .slice(0, MAX_ITEMS);
}
