/**
 * Quita teléfonos de terceros del texto libre que llega de fuentes externas.
 *
 * Los importadores copian la descripción tal cual viene, y ese texto lo escribió gente que puso su
 * número para que la llamaran. Que el dato fuera público en su sitio de origen **no lo hace nuestro
 * para republicarlo**: es la invariante 1 del proyecto, y sin este paso acaba servido por la API
 * pública de Pulso.
 *
 * Se descubrió tarde: 43 descripciones ya ingeridas traían un móvil visible. Por eso vive aquí, en
 * un solo sitio por el que pasan todas las fuentes, y no repetido dentro de cada importador — donde
 * el siguiente importador que alguien escriba se olvidaría de llamarlo.
 */

const MARK = "(contacto omitido)";

/** Móvil colombiano: 3 seguido de nueve dígitos, con espacios, puntos o guiones opcionales. */
const MOBILE = /(?<!\d)3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g;

/**
 * Cualquier número largo que aparezca justo después de una palabra que anuncia un contacto.
 *
 * Cubre los fijos y los números escritos raro, que el patrón de móvil no atrapa. Se limita a lo que
 * sigue a la palabra clave a propósito: enmascarar toda corrida larga de dígitos destruiría cifras
 * de dinero y cantidades sin ganar nada, porque el riesgo está en el número al que se puede llamar.
 */
const NEAR_CONTACT =
  /(contacto|celular|cel\.?|whatsapp|wpp|tel[eé]fono|tel\.?|llamar|comunicarse)([\s:.-]{0,12})(\+?\d[\d\s.-]{5,14}\d)/gi;

export function redactContacts(text: string): string;
export function redactContacts(text: null | undefined): null;
export function redactContacts(text: string | null | undefined): string | null;
export function redactContacts(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(NEAR_CONTACT, (_, word, gap) => `${word}${gap}${MARK}`).replace(MOBILE, MARK);
}
