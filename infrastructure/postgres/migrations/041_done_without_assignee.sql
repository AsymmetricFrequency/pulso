-- Un ticket terminado no necesita dueño. Uno tomado sí.
--
-- La restricción original de `025` decía: «libre ⇒ sin dueño, cualquier otro estado ⇒ con dueño».
-- Su intención está bien explicada en su comentario y sigue siendo correcta — pero solo para el par
-- que le importaba: **libre contra tomado**. Sin ella se acumulan filas «libres» con dueño y se
-- pierde de vista quién estaba en qué.
--
-- Aplicarla también a `hecho` y `bloqueado` fue extenderla más allá de lo que sostenía, y se notó al
-- primer caso real: `P0-10` se construyó y se desplegó sin pasar por el tablero, así que no había
-- ningún nombre honesto que ponerle. La única forma de cerrarlo era inventar un usuario de Discord
-- —falsear quién hizo el trabajo— o dejarlo como «libre», que invita a alguien a tomarlo y
-- descubrir a mitad que ya estaba hecho. Las dos opciones mienten; el modelo estaba mal.
--
-- `bloqueado` entra por el mismo razonamiento: un ticket puede estar bloqueado por algo externo
-- —una clave que falta, una respuesta que no llega— sin que nadie lo tenga en las manos.
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_check;

ALTER TABLE project_tasks
  ADD CONSTRAINT project_tasks_ownership_ck
  CHECK (
    (status = 'libre' AND assignee_discord_id IS NULL)
    OR (status = 'tomado' AND assignee_discord_id IS NOT NULL)
    OR status IN ('en_revision', 'hecho', 'bloqueado')
  );

-- `en_revision` conserva el dueño en la práctica —se llega ahí desde `tomado`— pero no se exige:
-- forzarlo impediría marcar en revisión un trabajo que llegó por fuera, que es exactamente el caso
-- que destapó todo esto.

-- Y ahora sí, cerrar P0-10. El resumen recupera su forma normal: el aviso de «YA ESTÁ HECHO, no lo
-- tomes» existía solo porque el estado no podía decirlo, y ahora lo dice el estado.
UPDATE project_tasks SET
  status = 'hecho',
  summary = 'Un equipo de rescate necesita saber por dónde puede llegar antes de saber a dónde va. '
    || 'Gravitas publica 14 cierres —derrumbes sobre la calzada, aeropuertos sin operación en Cali, '
    || 'Buenaventura, Cartago, Quibdó, Armenia, Manizales, Pereira, Bogotá e Ibagué— y los '
    || 'descartábamos en la ingesta por no tener dónde ponerlos. Hecho y desplegado el 16/08: tipo '
    || 'de reporte propio `via` (migración 036), con `route_status` como columna para que el mapa '
    || 'pueda dibujar distinto una vía cerrada de una reabierta.',
  updated_at = now()
WHERE code = 'P0-10';

-- No se registra un evento en `project_task_events`, y eso también es a propósito: esa tabla exige
-- `actor_discord_id` y `actor_username` NOT NULL, y ahí la restricción **sí** está bien puesta —un
-- evento lo hace alguien—. Como este cierre no lo hizo ningún usuario de Discord, inventar un actor
-- sería la misma mentira por otra puerta. El cambio queda en `updated_at` y en el resumen del
-- ticket, que dice cuándo se hizo y qué se desplegó.
