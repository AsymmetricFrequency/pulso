-- El inventario real, verificado contra el código el 16 de agosto de 2026.
--
-- Idempotente y separado del esquema, igual que `026`: esto se vuelve a correr cada vez que el
-- estado cambia. Nada de aquí se deduce del backlog — se comprobó ruta por ruta y tabla por tabla,
-- porque un inventario optimista es peor que no tener inventario.

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, sort_order) VALUES

-- P0 · Salvar vidas ---------------------------------------------------------
  (gen_random_uuid(), 'P0', 'Reportar personas atrapadas', 'listo',
   'Tipo de reporte propio con personas, señales de vida y si ya hay rescatistas. Ninguno obligatorio.', NULL, 10),
  (gen_random_uuid(), 'P0', 'El rescate va primero en la cola pública', 'listo',
   'Por encima del estado de revisión: la lista va recortada y sin esto un rescate nuevo podía no entrar en la respuesta.', NULL, 20),
  (gen_random_uuid(), 'P0', 'Marcador de rescate fuera del clúster', 'listo',
   'Capa propia y pulso solo cuando hay señales de vida. Agrupado quedaba invisible entre 2.300 puntos.', NULL, 30),
  (gen_random_uuid(), 'P0', 'Cola de rescate en Operaciones', 'falta',
   'Los rescates entran pero quien coordina no tiene dónde trabajarlos: la consola lista todo junto.', 'P0-1', 40),
  (gen_random_uuid(), 'P0', 'Reportar sin señal', 'falta',
   'Un derrumbe es donde peor anda la red. Hoy si el envío falla, el reporte se pierde.', 'P0-2', 50),
  (gen_random_uuid(), 'P0', 'Marcar que ya hay equipo en el punto', 'falta',
   'Evita el peor desperdicio de esta fase: dos equipos al mismo sitio y ninguno al otro.', 'P0-3', 60),
  (gen_random_uuid(), 'P0', 'Que la gente sepa que el botón existe', 'falta',
   'Cero rescates reportados hoy. Puede significar que no los hay o que nadie sabe que puede reportarlo.', 'P0-4', 70),
  (gen_random_uuid(), 'P0', 'Aviso a rescatistas cuando entra un reporte', 'falta',
   'Hoy el reporte espera a que alguien mire la pantalla. Sin aviso, la ventaja de reportar rápido se pierde entera.', NULL, 80),

-- P1 · Saber quién quedó afectado -------------------------------------------
  (gen_random_uuid(), 'P1', 'Modelo de personas, hogares, lugares y casos', 'listo',
   'Migración 012, con procedencia por fuente y cola de posibles duplicados.', NULL, 10),
  (gen_random_uuid(), 'P1', 'Cifrado de documentos y teléfonos', 'listo',
   'AES-256-GCM. Nunca salen por una ruta pública.', NULL, 20),
  (gen_random_uuid(), 'P1', 'API del censo', 'falta',
   'El hueco más grande del proyecto: el modelo existe y no hay un solo endpoint que lo toque.', 'P1-1', 30),
  (gen_random_uuid(), 'P1', 'Consola del censo', 'falta',
   'Sin la API no se puede empezar sin construir contra una forma que va a cambiar.', 'P1-2', 40),
  (gen_random_uuid(), 'P1', 'Bandeja de posibles duplicados', 'falta',
   'La tabla de candidatos existe; falta generarlos y que una persona los resuelva.', 'P1-3', 50),

-- P2 · Conectar la ayuda ----------------------------------------------------
  (gen_random_uuid(), 'P2', 'Necesidades ciudadanas en el mapa', 'listo',
   'Propias y de cuatro plataformas externas, con procedencia.', NULL, 10),
  (gen_random_uuid(), 'P2', 'Centros de acopio y albergues', 'listo',
   'Ingeridos de fuentes oficiales y ciudadanas.', NULL, 20),
  (gen_random_uuid(), 'P2', 'Catálogo de materiales, unidades y lotes', 'parcial',
   'Modelado en la migración 011. Sin API ni interfaz: no se puede usar.', NULL, 30),
  (gen_random_uuid(), 'P2', 'Emparejar una necesidad con quien la puede cubrir', 'falta',
   'Se ven las dos cosas en el mapa y nadie las conecta. Es todo el valor de P2.', 'P2-1', 40),
  (gen_random_uuid(), 'P2', 'Confirmación de entrega', 'falta',
   'Promesa, despacho y entrega son tres cosas distintas y hoy no se distingue ninguna.', NULL, 50),

-- P3 · Trazar la plata pública ----------------------------------------------
  (gen_random_uuid(), 'P3', 'Ingesta de SECOP II', 'listo',
   '357 contratos de entidades de territorios afectados, con enlace a la fuente.', NULL, 10),
  (gen_random_uuid(), 'P3', 'Revisión humana de contratos', 'listo',
   'Solo una persona escribe el campo que suman las cifras públicas.', NULL, 20),
  (gen_random_uuid(), 'P3', 'Página pública de auditoría', 'listo',
   'Con la advertencia antes de las cifras y estado cero honesto.', NULL, 30),
  (gen_random_uuid(), 'P3', 'Lectura previa de contratos con Claude', 'parcial',
   'Desplegado y quieto: falta ANTHROPIC_API_KEY. Unos 3 USD por los 357.', 'P0-5', 40),
  (gen_random_uuid(), 'P3', 'Trazar el dinero hasta el territorio', 'parcial',
   'La cadena está modelada; sin contratos confirmados no hay nada que mostrar todavía.', NULL, 50),

-- PL · Plataforma -----------------------------------------------------------
  (gen_random_uuid(), 'PL', 'Producción en pulso.my', 'listo',
   'Web, API y worker con despliegue reproducible.', NULL, 10),
  (gen_random_uuid(), 'PL', 'Panel administrativo con Discord', 'listo',
   'Identidad y roles los pone Discord. Solo Maintainer y superusuarios escriben.', NULL, 20),
  (gen_random_uuid(), 'PL', 'Licencia, guía de contribución y CI', 'listo',
   'Apache-2.0. Antes nadie podía contribuir legalmente.', NULL, 30),
  (gen_random_uuid(), 'PL', 'Estado de las fuentes de ingesta', 'listo',
   'Visible en este panel. Falta que avise solo cuando una falla.', 'PL-9', 40),
  (gen_random_uuid(), 'PL', 'Ingesta oficial de Cali', 'parcial',
   'Bloqueada por HTTP 403 desde el origen. No se rodea: el camino es datos.gov.co o una solicitud Ley 1712.', NULL, 50),
  (gen_random_uuid(), 'PL', 'Un solo motor de mapa', 'falta',
   'Hoy hay dos y entrar a un departamento cambia de motor. Todo hay que implementarlo dos veces.', 'PL-1', 60),
  (gen_random_uuid(), 'PL', 'Mover o corregir un punto sin tocar la base', 'falta',
   'Corregir una ubicación mal puesta implica entrar a Postgres.', 'PL-2', 70),
  (gen_random_uuid(), 'PL', 'Límite de tasa en las rutas públicas de lectura', 'falta',
   'Solo el POST de reportes lo tiene. El día que nos enlace un medio grande, se cae.', 'PL-10', 80),
  (gen_random_uuid(), 'PL', 'Pruebas de extremo a extremo del flujo de reporte', 'falta',
   'Lo más usado del sitio es lo menos probado.', 'PL-11', 90),
  (gen_random_uuid(), 'PL', 'Respaldos restaurados de verdad', 'falta',
   'Un respaldo que nunca se restauró no es un respaldo.', 'PL-8', 100),
  (gen_random_uuid(), 'PL', 'Anclaje de integridad en Solana', 'parcial',
   'Programa escrito y probado en local. Falta Devnet, relayer y verificador público.', 'PL-6', 110),
  (gen_random_uuid(), 'PL', 'Interoperabilidad con entidades', 'falta',
   'Ninguna entidad adopta un formato nuevo en emergencia; el que se adapta es Pulso.', 'PL-5', 120)

ON CONFLICT (priority, name) DO UPDATE SET
  status = EXCLUDED.status,
  note = EXCLUDED.note,
  task_code = EXCLUDED.task_code,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
