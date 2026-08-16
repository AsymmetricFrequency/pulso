-- La rama de cada ticket, decidida al asignarlo y no al empezar a trabajar.
--
-- Sin esto cada persona inventa su nombre y `git branch -a` deja de ser legible: la prioridad va
-- delante justamente para que el listado alfabético muestre primero lo que más importa, y eso solo
-- funciona si todo el mundo usa el mismo esquema. Decidirlo al asignar quita esa decisión de encima
-- de quien va a trabajar.
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS branch text;

UPDATE project_tasks SET branch = v.branch FROM (VALUES
  ('P0-1',  'p0/p0-1-cola-rescate-operaciones'),
  ('P0-2',  'p0/p0-2-rescate-sin-senal'),
  ('P0-3',  'p0/p0-3-marcar-rescate-atendido'),
  ('P0-4',  'p0/p0-4-difusion-boton-rescate'),
  ('P0-5',  'p3/p0-5-correr-triaje-contratos'),
  ('P0-6',  'p0/p0-6-aviso-rescatistas'),
  ('P0-7',  'p0/p0-7-sala-situacion-ciudad'),
  ('P0-8',  'p0/p0-8-alojamiento-vs-acopio'),
  ('P1-1',  'p1/p1-1-api-censo-damnificados'),
  ('PL-10', 'plataforma/pl-10-limite-tasa-lectura')
) AS v(code, branch) WHERE project_tasks.code = v.code;
