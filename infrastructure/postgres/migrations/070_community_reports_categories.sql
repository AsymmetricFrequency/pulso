-- Categorías nuevas para lo que hoy se mezclaba dentro de «necesidad».
--
-- Viene de la rama de frontend, donde llegó numerada como `044` — número que main ya había usado.
-- Renumerada a 070 al integrarla: dos migraciones con el mismo número se pisan según el orden
-- alfabético del directorio, y cuál gana depende de la máquina.
--
-- ## Lo que se toma y lo que no
--
-- La rama proponía cuatro cambios. Se toman dos y se rechazan dos, y conviene decir por qué:
--
-- **Se toma `catastros`** — censo catastral no cabía en ninguna categoría y se estaba yendo a
-- `otro`, que ya tiene 938 filas y es donde va a morir cualquier cosa que no tenga sitio.
--
-- **Se toma `puntos_ayuda`** — un punto de ayuda operativo no es un centro de acopio ni un
-- albergue, y hoy se confunde con los dos.
--
-- **No se toma `centros_acopio`.** Mientras esa rama estaba abierta, main resolvió lo mismo por
-- otra vía: `acopio` es un **tipo de reporte** desde la migración 046, con 1.113 filas ya
-- reclasificadas. Añadirlo también como categoría dejaría dos maneras de decir lo mismo y la
-- pregunta «¿cuántos acopios hay?» tendría dos respuestas.
--
-- **No se toma el renombre de `refugio` a `albergues`, y esta es la parte que importa.** Parecen el
-- mismo concepto y no lo son:
--
-- · `albergue` (tipo) es un **sitio**: aquí duerme gente esta noche. Tiene aforo y ocupación.
-- · `refugio` (categoría) es una **necesidad**: alguien no tiene dónde dormir y lo está pidiendo.
--
-- Un albergue lleno y una familia pidiendo refugio son las dos caras del mismo problema, y
-- fusionarlas borraría justo la comparación que hace falta para saber si el alojamiento alcanza.
-- Las 54 filas con `refugio` se quedan como están.
ALTER TABLE community_reports DROP CONSTRAINT IF EXISTS community_reports_category_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_category_check
  CHECK (category IS NULL OR category IN (
    'agua', 'alimentos', 'salud', 'refugio', 'higiene', 'herramienta',
    'escombros', 'voluntariado', 'animales', 'logistica',
    'catastros', 'puntos_ayuda', 'otro'
  ));

SELECT category, count(*) FROM community_reports GROUP BY 1 ORDER BY 2 DESC;
