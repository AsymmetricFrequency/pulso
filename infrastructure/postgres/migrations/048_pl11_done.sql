-- `PL-11` hecho: lo más usado del sitio ya está probado.
--
-- La aceptación pedía «una prueba de navegador que cubra reportar un rescate y una necesidad, y que
-- corra en CI». Las dos existen en `apps/web/e2e/reporte.e2e.ts` y corren en el job de CI con
-- Chromium; las tres últimas corridas están en verde.
--
-- **Lo que hace que la prueba valga:** el cuerpo del POST se valida contra `createCommunityReportSchema`
-- —el esquema real del servidor, importado— y no contra una copia escrita a mano en la prueba. Una
-- copia se queda atrás en silencio y la prueba sigue pasando mientras el formulario manda algo que
-- la API rechaza, que es exactamente el fallo que esta prueba existe para atrapar.
UPDATE project_tasks SET
  status = 'hecho',
  completed_at = now(),
  summary = 'HECHO el 18/08. Dos pruebas de navegador en `apps/web/e2e/reporte.e2e.ts`, corriendo '
    || 'en CI con Chromium: reportar un rescate y reportar una necesidad. El cuerpo del POST se '
    || 'valida contra `createCommunityReportSchema` importado del servidor, no contra una copia — '
    || 'una copia se queda atrás sin avisar y la prueba pasaría mientras el formulario manda algo '
    || 'que la API rechaza. La segunda prueba cubre además que el formulario no deje enviar una '
    || 'necesidad sin categoría, que es lo que el esquema del servidor rechaza.',
  updated_at = now()
WHERE code = 'PL-11';

UPDATE project_capabilities SET
  status = 'listo',
  note = 'Rescate y necesidad cubiertos por prueba de navegador en CI desde el 18/08, validando '
    || 'contra el esquema real del servidor.',
  updated_at = now()
WHERE priority = 'PL' AND name ILIKE '%extremo a extremo%';
