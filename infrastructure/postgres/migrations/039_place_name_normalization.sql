-- Normalización de nombres de municipio, para poder comparar lo que dice una fuente con el marco
-- geoestadístico del DANE.
--
-- Sale de intentar validar geocodificaciones. Comparar el nombre que devuelve el geocodificador no
-- funciona y no es un detalle: OSM etiqueta los municipios colombianos como «Perímetro Urbano
-- Medellín», «Cartagena de Indias», o directamente por el corregimiento —«La Buitrera» para un
-- punto que sí está en Cali—. La igualdad de texto rechaza los tres siendo correctos. La contención
-- acepta «Medio Atrato» cuando la fuente dijo «Atrato», que es un municipio distinto a horas de
-- camino, y es el error real que se midió.
--
-- La respuesta está en la geometría, no en el texto: **¿cae el punto dentro del polígono del
-- municipio que declaró la fuente?** Para eso hay que emparejar el nombre declarado con un polígono
-- del DANE, y ahí sí hace falta normalizar — pero solo una vez y con una regla escrita.
CREATE OR REPLACE FUNCTION pulso_normalize_place(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT trim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(translate(input, 'ÁÉÍÓÚÑÜáéíóúñüÀÈÌÒÙàèìòù', 'AEIOUNUaeiounuAEIOUaeiou')),
        -- «BOGOTÁ, D.C.» y «Bogotá» son el mismo sitio; «Cali ciudad» y «Cali» también.
        '\m(d\.?\s*c\.?|ciudad|municipio|distrito)\M', ' ', 'g'),
      '[^a-z0-9 ]', ' ', 'g'),
    '\s+', ' ', 'g'))
$$;

COMMENT ON FUNCTION pulso_normalize_place(text) IS
  'Nombre de lugar comparable: sin tildes, sin puntuación y sin los sufijos administrativos que '
  'no distinguen un municipio de otro. NO colapsa nombres realmente distintos: «atrato» y '
  '«medio atrato» siguen siendo distintos, que es justo lo que hay que preservar.';

-- El emparejamiento nombre → polígono se hace por este índice funcional. Sin él, cada validación de
-- una dirección recorrería los 1.121 municipios.
CREATE INDEX IF NOT EXISTS territories_normalized_name_idx
  ON territories (pulso_normalize_place(name))
  WHERE territory_type = 'municipality' AND deleted_at IS NULL;
