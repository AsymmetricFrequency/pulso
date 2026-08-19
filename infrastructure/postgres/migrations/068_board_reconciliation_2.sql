-- Poner el tablero al día con lo que de verdad hay en el código.
--
-- Se cierra **una sola** tarea. El resto de las abiertas siguen abiertas porque su criterio de
-- aceptación no se cumple, y marcarlas de otro modo convertiría el tablero en un adorno. Lo que sí
-- hace falta es anotar en tres de ellas lo que ya existe: hay trabajo construido en paralelo que
-- se pisa con lo que dicen esos tickets, y quien los tome tiene que enterarse antes de escribir la
-- primera línea, no después.

-- ## PL-9 — hecho de verdad
--
-- Su criterio pedía dos cosas: un panel con la última corrida, resultado y número de registros de
-- cada fuente, y un aviso en Discord cuando una falla. Las dos están: la tabla «Fuentes» del panel
-- administrativo y `apps/worker/src/source-health.ts`, enganchado en el planificador.
UPDATE project_tasks
SET status = 'hecho',
    completed_at = now(),
    updated_at = now(),
    summary = coalesce(summary || ' ', '')
      || '**HECHO.** El panel administrativo lista cada fuente con su última corrida, su resultado '
      || 'y cuántos registros vio. El aviso a Discord lo manda `source-health.ts` desde el '
      || 'planificador, y avisa **en el cambio de estado**, no en cada fallo: Cali falla cada 30 '
      || 'minutos por diseño y avisarlo 48 veces al día silenciaría el canal justo para el aviso '
      || 'que sí importa. Avisa también cuando una fuente vuelve.'
WHERE code = 'PL-9' AND status <> 'hecho';

-- ## P1-1 y P1-2 — el aviso que evita construir dos censos
--
-- Estas dos tareas describen el modelo de la migración 012: `affected_people`,
-- `affected_households`, `disaster_cases`. **No hay ni un endpoint que toque esas tablas**, así que
-- siguen abiertas con toda razón.
--
-- Lo que pasó es que se construyó otro camino para el mismo problema: `household_self_registrations`,
-- donde la familia se registra sola desde el teléfono y Operaciones valida después. Ese camino ya
-- está en producción y ya cumple la mitad del criterio de P1-1 —cifrado de documentos y teléfonos,
-- nada personal por ruta pública— pero sobre otras tablas.
--
-- **Que existan los dos no es un detalle de implementación: son dos censos de las mismas personas.**
-- Es exactamente el problema que P1-3 existe para limpiar, creado a propósito por nosotros. Antes
-- de seguir, alguien tiene que decidir si el modelo de 012 se retoma, se abandona o se conecta.
UPDATE project_tasks
SET updated_at = now(),
    summary = coalesce(summary || ' ', '')
      || E'\n\n**OJO antes de empezar (18/08).** Se construyó en paralelo un registro que la '
      || 'familia llena sola: tabla `household_self_registrations`, formulario en '
      || '`pulso.my/necesito-ayuda`, cola de validación en Operaciones, y la familia consulta y '
      || 'desmiente entregas con su código en `pulso.my/mi-registro`. Cifrado AES-256-GCM, '
      || 'consentimiento versionado, finalidades separadas con trigger, retención de 90 días. '
      || '**No toca `affected_people` ni `disaster_cases`** — son dos modelos distintos para las '
      || 'mismas personas. Hay que decidir si este ticket se retoma sobre el modelo de la 012, se '
      || 'reescribe sobre el registro nuevo, o se abandona. Construir los dos crea justo el '
      || 'problema de duplicados de P1-3.'
WHERE code IN ('P1-1', 'P1-2');

-- ## P1-3 — lo que ya tiene resuelto
--
-- Su criterio sigue en pie, pero conviene decir qué parte ya no hay que inventar.
UPDATE project_tasks
SET updated_at = now(),
    summary = coalesce(summary || ' ', '')
      || E'\n\n**Ya existe (18/08)** la mitad de la señal para el registro ciudadano: '
      || '`registration_validations` guarda por cada registro si contrasta o no con lo que se sabe '
      || 'del territorio (`coherente` / `sin_contraste` / `revisar`), y `registration_reviews` '
      || 'guarda quién lo resolvió. Nada se fusiona solo, que es lo que pide este ticket. Lo que '
      || 'falta es el emparejamiento entre registros y la bandeja.'
WHERE code = 'P1-3';

SELECT status, count(*) FROM project_tasks GROUP BY 1 ORDER BY 2 DESC;
