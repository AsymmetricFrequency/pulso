-- Cuatro niveles de urgencia en vez de tres horizontes.
--
-- «Corto, mediano y largo plazo» habla de *cuándo* se hará. Eso no es lo que hace falta decidir aquí:
-- hace falta saber **qué pasa si se retrasa**, que es otra cosa. Dentro del corto plazo caben un
-- ticket cuyo retraso cuesta vidas y uno cuyo retraso cuesta una molestia, y meterlos en la misma
-- caja obliga a releer los dos para distinguirlos.
--
-- La prioridad (P0–P3) dice a qué objetivo sirve un ticket. La urgencia dice cuánto puede esperar.
-- Son ejes distintos: hay trabajo de P0 que puede esperar una semana y trabajo de plataforma que no
-- puede esperar un día — el límite de tasa, por ejemplo, el día que nos enlace un medio grande.
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_horizon_check;

UPDATE project_tasks SET horizon = CASE code
  -- Extrema: el retraso se mide en vidas. Todo lo que va de un reporte de personas atrapadas a un
  -- equipo saliendo hacia el punto.
  WHEN 'P0-1' THEN 'extrema'   -- sin la cola, un rescate reportado no lo ve quien coordina
  WHEN 'P0-2' THEN 'extrema'   -- un derrumbe es justo donde peor anda la red
  WHEN 'P0-4' THEN 'extrema'   -- un botón que nadie sabe que existe no salva a nadie
  WHEN 'P0-6' THEN 'extrema'   -- sin aviso, el reporte espera a que alguien mire la pantalla
  WHEN 'P0-7' THEN 'extrema'   -- coordinar exige saber qué pasa en una ciudad, hoy no se puede

  -- Urgencia: días. Duele y desperdicia recursos, pero nadie se queda debajo por esto.
  WHEN 'P0-3' THEN 'urgente'   -- evita mandar dos equipos al mismo punto
  WHEN 'P0-8' THEN 'urgente'   -- sin esto el mapa no dice dónde queda espacio para alojar
  WHEN 'P0-5' THEN 'urgente'   -- una hora de trabajo que desbloquea 357 contratos
  WHEN 'PL-10' THEN 'urgente'  -- el día que nos enlace un medio grande, se cae

  -- Media: semanas. Es la fase siguiente de la emergencia, no la de ahora.
  WHEN 'P1-1' THEN 'media'
  WHEN 'P1-2' THEN 'media'
  WHEN 'P1-3' THEN 'media'
  WHEN 'P2-1' THEN 'media'
  WHEN 'PL-1' THEN 'media'
  WHEN 'PL-2' THEN 'media'
  WHEN 'PL-3' THEN 'media'
  WHEN 'PL-4' THEN 'media'
  WHEN 'PL-9' THEN 'media'
  WHEN 'PL-11' THEN 'media'

  ELSE 'largo'
END;

ALTER TABLE project_tasks
  ADD CONSTRAINT project_tasks_horizon_check
  CHECK (horizon IN ('extrema', 'urgente', 'media', 'largo'));
