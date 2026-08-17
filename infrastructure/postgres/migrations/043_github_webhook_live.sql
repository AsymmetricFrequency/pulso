-- El flujo manual GitHub → Discord está en pie desde el 17/08.
--
-- `PL-4` (el bot que sincroniza tickets) tenía una condición escrita en su propio ticket: **hacerse
-- después de que el flujo manual con webhooks lleve una semana funcionando**. El razonamiento sigue
-- siendo bueno y por eso no se toca el ticket: si el flujo manual no se usa, automatizarlo no lo va
-- a arreglar — solo va a automatizar algo que a nadie le importaba.
--
-- Lo que cambia hoy es que ese reloj **empezó a correr**, y conviene que quede escrito para que
-- dentro de una semana alguien pueda mirar y decidir con datos en vez de con memoria.
UPDATE project_tasks SET
  summary = 'El bot descrito en docs/34-discord.md, sección 3. **Se hace después de que el flujo '
    || 'manual lleve una semana funcionando**: si nadie lo usa, automatizarlo no lo arregla. '
    || 'El webhook GitHub → #github quedó activo el 17/08 con push, pull_request, issues, '
    || 'issue_comment y release, así que la semana empieza a contar desde ahí. Antes de tomar este '
    || 'ticket, mira si el equipo de verdad está leyendo #github o si el canal está muerto — esa '
    || 'respuesta decide si vale la pena.',
  updated_at = now()
WHERE code = 'PL-4';

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES
  (gen_random_uuid(), 'PL', 'Avisos a Discord que de verdad suenan', 'listo',
   'Un rescate reportado menciona a @everyone y una fuente caída a @DevOps. Hacía falta la mención: el servidor tiene Comunidad activada y Discord fuerza «solo @menciones», así que un aviso sin mención no notifica a nadie.', NULL, 250),
  (gen_random_uuid(), 'PL', 'Actividad del repositorio en Discord', 'listo',
   'Webhook GitHub → #github con push, pull_request, issues, issue_comment y release. Deliberadamente NO «send me everything»: un canal con todo el ruido de GitHub se silencia.', NULL, 260)
ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status, note = EXCLUDED.note, sort_order = EXCLUDED.sort_order,
  updated_at = now();
