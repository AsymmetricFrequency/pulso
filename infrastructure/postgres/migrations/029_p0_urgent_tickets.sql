-- Los tres huecos de P0 que faltaban por escribir.
--
-- Salen de una observación concreta sobre lo que hay hoy: Pulso sabe pintar 2.300 puntos sobre el
-- país, y no sabe responder «¿qué pasa en esta ciudad ahora mismo?». Para coordinar un rescate esa
-- es la única pregunta que importa, y hoy exige entrar a un departamento, esperar a que cargue el
-- otro motor de mapa, y contar puntos a ojo.
--
-- Idempotente como `026`: no toca estado ni responsable.

INSERT INTO project_tasks
  (id, code, title, summary, acceptance, priority, size, roles, horizon, depends_on, sort_order)
VALUES

  (gen_random_uuid(), 'P0-6', 'Avisar a los rescatistas cuando entra un reporte',
   'Hoy un reporte de personas atrapadas se queda esperando a que alguien mire la pantalla. Sin aviso, toda la ventaja de que reportar sea rápido se pierde en el último tramo. El webhook de #alertas ya existe y el cliente de Discord ya sabe publicar; falta disparar en el momento del reporte y ofrecer una segunda vía que no dependa de que alguien tenga Discord abierto.',
   'Al enviar un rescate, en menos de un minuto aparece un aviso en #alertas con las personas, las señales de vida y un enlace al punto en el mapa. Un fallo al avisar nunca impide que el reporte se guarde.',
   'P0', 'M', ARRAY['backend','devops'], 'corto', '{}', 60),

  (gen_random_uuid(), 'P0-7', 'Sala de situación por ciudad',
   'Pulso pinta 2.300 puntos sobre el país y no responde «qué pasa en esta ciudad ahora mismo». Hace falta una pantalla por ciudad con los puntos críticos juntos: rescates abiertos, derrumbes reportados, PMU, albergues y carpas, centros de acopio y necesidades sin cubrir. Es la vista que mira quien coordina, y hoy no existe en ninguna forma.',
   'Desde el informe público se elige una ciudad y se ve una sola pantalla con sus puntos críticos agrupados por tipo, cada uno con cuándo se reportó y su estado. Los rescates van arriba y separados del resto.',
   'P0', 'L', ARRAY['frontend','gis'], 'corto', '{}', 70),

  (gen_random_uuid(), 'P0-8', 'Distinguir un alojamiento temporal de un centro de acopio',
   'Hoy todo cae en la categoría refugio o en un PMU, y no son lo mismo: una carpa donde duerme gente esta noche tiene capacidad, ocupación y necesidades propias; un acopio recibe y despacha. Mezclarlos hace que el mapa no pueda decir dónde queda espacio para alojar a alguien.',
   'Un alojamiento temporal se reporta como tal, con capacidad y ocupación aproximadas, y el mapa lo distingue de un acopio a simple vista. Las fuentes externas ya ingeridas se reclasifican sin perder su procedencia.',
   'P0', 'M', ARRAY['backend','frontend'], 'corto', '{}', 80)

ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  acceptance = EXCLUDED.acceptance,
  priority = EXCLUDED.priority,
  size = EXCLUDED.size,
  roles = EXCLUDED.roles,
  horizon = EXCLUDED.horizon,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- El inventario tiene que reflejarlos, o el panel diría que P0 tiene menos huecos de los que tiene.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES
  (gen_random_uuid(), 'P0', 'Aviso a rescatistas cuando entra un reporte', 'falta',
   'El webhook de #alertas y el cliente de Discord ya existen. Falta disparar en el momento del reporte.', 'P0-6', 80),
  (gen_random_uuid(), 'P0', 'Sala de situación por ciudad', 'falta',
   'Pulso pinta 2.300 puntos sobre el país y no responde qué pasa en una ciudad ahora mismo.', 'P0-7', 90),
  (gen_random_uuid(), 'P0', 'Alojamientos temporales separados de los acopios', 'falta',
   'Una carpa donde duerme gente tiene capacidad y ocupación; un acopio recibe y despacha. Hoy se mezclan.', 'P0-8', 100)
ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status,
  note = EXCLUDED.note,
  task_code = EXCLUDED.task_code,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
