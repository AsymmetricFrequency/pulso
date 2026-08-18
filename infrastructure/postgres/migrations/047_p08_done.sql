-- `P0-8` hecho: acopio, albergue y puesto de mando son tres cosas distintas en el mapa.
--
-- El ticket estaba `tomado` por ElBrayan desde el 16/08 sin avance registrado, y lo tomamos porque
-- bloqueaba partir el mapa por tipo de reporte. Se le quita la asignación en vez de dejarlo con su
-- nombre: un tablero que atribuye a alguien un trabajo que no hizo deja de servir para saber quién
-- está en qué. El aviso va a su hilo.
--
-- Los tres criterios de aceptación, contra producción el 18/08:
--
-- · **«Un alojamiento temporal se reporta como tal»** — `albergue` es un tipo propio, con
--   `shelter_capacity` y `shelter_occupancy` opcionales y restringidos a él por CHECK.
-- · **«El mapa lo distingue de un acopio a simple vista»** — glifo propio (techo con cama contra
--   caja abierta) y color propio, así que la diferencia no depende de distinguir dos colores.
-- · **«Las fuentes externas ya ingeridas se reclasifican sin perder su procedencia»** — 842 puntos
--   reclasificados por `UPDATE` conservando `external_source_id` y `external_key`, y los 279 de
--   mapadelterremoto corregidos por su propio importador, que sí conoce el tipo original.
--
-- Estado tras la corrida: 1.080 acopios, 36 albergues, 5 puestos de mando. Antes eran 1.121 «PMU».
UPDATE project_tasks SET
  status = 'hecho',
  assignee_discord_id = NULL,
  assignee_username = NULL,
  completed_at = now(),
  summary = 'HECHO el 18/08. `pmu` era un cajón de sastre: 1.121 puntos etiquetados «Puesto de '
    || 'mando» y solo 5 lo eran. Ahora hay 1.080 acopios, 36 albergues y esos 5 puestos de mando, '
    || 'cada uno con su glifo y su color, y filtros en el mapa para verlos por separado. La '
    || 'reclasificación se hizo por fuente entera, no por texto: buscar «albergue» en el título '
    || 'acertaba 36 de 279 en mapadelterremoto y 0 de 181 en Gravitas.',
  updated_at = now()
WHERE code = 'P0-8';

-- La capacidad de un albergue es la parte que **no** está resuelta y conviene que se vea en el
-- tablero antes que en una sorpresa: el campo existe, pero ninguna de las fuentes que ingerimos lo
-- publica, así que hoy los 36 albergues llegan sin cifra. Se llena cuando alguien lo reporte o
-- cuando una fuente lo publique; mientras tanto el mapa dice dónde hay un albergue, no si cabe
-- alguien más.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P0', 'Cupo disponible en albergues', 'parcial',
  'El campo existe (`shelter_capacity` / `shelter_occupancy`, restringidos a `albergue`) y el mapa '
  || 'sabe dibujarlo. Ninguna de las fuentes que ingerimos publica la cifra, así que los 36 '
  || 'albergues de hoy llegan sin ella. «Dónde hay un albergue» está respondido; «si cabe alguien '
  || 'más» no.',
  'P0-8', now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities WHERE priority = 'P0' AND name = 'Cupo disponible en albergues'
);
