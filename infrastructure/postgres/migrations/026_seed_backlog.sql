-- Los tickets de `docs/33-backlog.md`, como datos.
--
-- Va aparte de `025` a propósito: el esquema se aplica una vez y esto se vuelve a correr cada vez
-- que el backlog cambia. Por eso es idempotente (`ON CONFLICT (code) DO UPDATE`) y por eso nunca
-- toca `status` ni `assignee_*` — si lo hiciera, actualizar la descripción de un ticket desasignaría
-- a quien lo tenga tomado.
--
-- El documento sigue siendo la fuente del *porqué* de cada ticket: las trampas conocidas, los
-- intentos anteriores, el razonamiento. Eso no cabe en una tabla y no se intenta meter aquí.

INSERT INTO project_tasks
  (id, code, title, summary, acceptance, priority, size, roles, horizon, depends_on, sort_order)
VALUES
  (gen_random_uuid(), 'P0-1', 'Cola de rescate en Operaciones',
   'Existe el tipo de reporte rescate y el mapa lo pinta, pero quien coordina no tiene dónde trabajarlo: la consola lista todos los reportes juntos.',
   'Un coordinador ve los rescates abiertos sin filtrar nada, en menos de tres segundos sabe cuál atender primero, y al marcar uno como atendido desaparece de la cola activa sin borrarse del historial.',
   'P0', 'L', ARRAY['frontend','backend'], 'corto', '{}', 10),

  (gen_random_uuid(), 'P0-2', 'Que un rescate sobreviva a la falta de señal',
   'Un derrumbe es exactamente donde peor anda la red. Hoy si el POST falla, el formulario dice sin conexión y el reporte se pierde. Ya existe la cola offline en IndexedDB de Pulso Campo.',
   'Con el modo avión puesto, enviar un rescate muestra guardado, se enviará solo, y al volver la señal llega sin duplicarse.',
   'P0', 'M', ARRAY['frontend'], 'corto', '{}', 20),

  (gen_random_uuid(), 'P0-3', 'Marcar un rescate como atendido desde el mapa público',
   'Si un equipo ya llegó a un punto, quien pasa por ahí debería poder decirlo sin entrar a Operaciones. Evita el peor desperdicio de esta fase: dos equipos al mismo sitio y ninguno al otro.',
   'Desde el detalle de un rescate se puede reportar ya hay equipo aquí sin cuenta, con el mismo límite de tasa que el resto, y el marcador cambia de aspecto.',
   'P0', 'S', ARRAY['frontend','backend'], 'corto', '{}', 30),

  (gen_random_uuid(), 'P0-4', 'Difusión del botón de rescate',
   'La función más rápida del mundo no sirve si nadie en Cali sabe que existe. Hace falta una pieza corta y compartible, y llevarla a los canales donde ya está la gente.',
   'Existe la pieza, está publicada, y podemos nombrar tres canales donde llegó. El mensaje dice llama al 123 primero: sin esa frase no se publica.',
   'P0', 'M', ARRAY['contributor'], 'corto', '{}', 40),

  (gen_random_uuid(), 'P0-5', 'Que el triaje de contratos corra',
   'Está desplegado y quieto: falta ANTHROPIC_API_KEY en el .env del servidor. Son unos 3 USD por los 357 contratos. Es P3, pero es de una hora y desbloquea toda la cola de auditoría.',
   'Corrió con PULSO_TRIAGE_LIMIT=20, alguien leyó los 20 razonamientos y dijo si el criterio sirve, y solo entonces corrió el resto.',
   'P3', 'S', ARRAY['ai','devops'], 'corto', '{}', 50),

  (gen_random_uuid(), 'P1-1', 'API del censo de damnificados',
   'El hueco más grande del proyecto. La migración 012 modela personas, hogares, lugares afectados, casos y candidatos de duplicado, y no existe un solo endpoint que lo toque. Se puede partir en tres PRs: esquemas y dominio, repositorios, rutas.',
   'Desde Operaciones se registra una persona afectada sin documento, se le adjunta una necesidad, y se ve su estado en la máquina de estados de docs/25. Documentos y teléfonos van cifrados y no salen por ninguna ruta pública.',
   'P1', 'L', ARRAY['backend'], 'mediano', '{}', 60),

  (gen_random_uuid(), 'P1-2', 'Consola del censo',
   'La interfaz de P1-1. No empezar hasta que sus esquemas estén mergeados, o se construye contra una forma que va a cambiar.',
   'Un coordinador da de alta y sigue un caso completo sin tocar la base de datos.',
   'P1', 'L', ARRAY['frontend'], 'mediano', ARRAY['P1-1'], 70),

  (gen_random_uuid(), 'P1-3', 'Bandeja de posibles duplicados',
   'Una familia aparece en un albergue, en un formulario ciudadano y en el RUFE. La tabla de candidatos ya existe; falta generarlos y una bandeja donde una persona los resuelva. Misma dirección no significa duplicado.',
   'La bandeja propone candidatos con la señal que los emparejó, y una persona confirma o descarta. Nada se fusiona automáticamente.',
   'P1', 'M', ARRAY['backend','ai'], 'mediano', ARRAY['P1-1'], 80),

  (gen_random_uuid(), 'P2-1', 'Emparejar necesidad con oferta',
   'Hoy el mapa muestra necesidades y muestra centros de acopio, y nadie los conecta. El emparejamiento es todo el valor de P2 y está sin construir.',
   'Dado un punto con una necesidad abierta, la interfaz muestra qué acopio cercano tiene ese insumo y se registra un compromiso de entrega que después se confirma. Promesa, despacho y entrega siguen siendo tres cosas distintas.',
   'P2', 'L', ARRAY['backend','frontend'], 'mediano', '{}', 90),

  (gen_random_uuid(), 'PL-1', 'Un solo motor de mapa',
   'Hoy hay dos: atlas-map (d3-geo, país) y leaflet-map (departamento). Entrar a un departamento cambia de motor en vez de hacer zoom, y por eso todo hay que implementarlo dos veces. Ya se intentó con MapLibre y se revirtió con el lienzo en blanco: prototipo aislado primero, no tocar el mapa de producción.',
   'El prototipo renderiza país y municipio en un solo motor con los puntos reales, y hay una nota de una página diciendo por qué falló el intento anterior y por qué este no.',
   'PL', 'L', ARRAY['gis'], 'mediano', '{}', 100),

  (gen_random_uuid(), 'PL-2', 'Agregar y mover puntos sin fricción',
   'Hoy corregir la ubicación de un punto mal puesto implica entrar a la base de datos.',
   'Desde Operaciones se arrastra un marcador a su sitio correcto y queda guardado con historial de quién lo movió y desde dónde.',
   'PL', 'M', ARRAY['frontend','gis'], 'mediano', '{}', 110),

  (gen_random_uuid(), 'PL-3', 'Panel de administración con Discord',
   'Entrar con Discord, que el rol del servidor sea el permiso en Pulso, y ver el estado de la operación en una pantalla. Diseño en docs/34-discord.md.',
   'Un Maintainer entra con Discord, ve rescates abiertos y estado de fuentes, y asigna un ticket a un miembro.',
   'PL', 'L', ARRAY['backend','frontend'], 'mediano', '{}', 120),

  (gen_random_uuid(), 'PL-4', 'Sincronizar tickets entre GitHub y Discord',
   'El bot de docs/34-discord.md. Se hace después de que el flujo manual con webhooks lleve una semana funcionando: si el flujo manual no se usa, automatizarlo no lo va a arreglar.',
   'Un ticket tomado en Discord queda asignado en GitHub y al revés, sin que nadie copie nada a mano.',
   'PL', 'M', ARRAY['backend','devops'], 'mediano', ARRAY['PL-3'], 130),

  (gen_random_uuid(), 'PL-5', 'Interoperabilidad institucional',
   'Exportar a los formatos que la UNGRD, las alcaldías y los organismos de socorro ya usan. Ninguna entidad adopta un formato nuevo en emergencia; el que se adapta es Pulso.',
   'Existe al menos un export que una entidad real pidió y confirmó que puede leer.',
   'PL', 'L', ARRAY['backend','data'], 'largo', '{}', 140),

  (gen_random_uuid(), 'PL-6', 'Anclaje de integridad más allá de Devnet',
   'El programa pulso_anchor está escrito y probado en local. Falta Devnet estable, el relayer y el verificador público de manifiestos. Una caída de Solana nunca puede bloquear un registro de emergencia.',
   'Un corte publicado se ancla y se verifica de extremo a extremo, y con el relayer caído el registro sigue funcionando.',
   'PL', 'L', ARRAY['blockchain'], 'largo', '{}', 150),

  (gen_random_uuid(), 'PL-7', 'Despliegue para otra emergencia',
   'Que Pulso se levante para otro desastre en otro país sin reescribirlo: incidente, territorios y fuentes como configuración, no como código.',
   'Existe un procedimiento escrito que alguien que no construyó esto puede seguir hasta tener una instancia en pie.',
   'PL', 'L', ARRAY['backend','devops'], 'largo', '{}', 160),

  (gen_random_uuid(), 'PL-8', 'Modelo de amenazas y respaldos probados',
   'Son puertas de producción en docs/07 y siguen sin cerrar. Un respaldo que nunca se restauró no es un respaldo.',
   'Hay una restauración hecha de verdad, cronometrada y anotada.',
   'PL', 'M', ARRAY['devops'], 'largo', '{}', 170),

  (gen_random_uuid(), 'PL-9', 'Panel de estado de las ingestas',
   'El worker corre por cron y no hay dónde ver si una fuente dejó de responder. Una ingesta que falla se descubre tarde y por casualidad.',
   'El panel muestra cada fuente con su última corrida, resultado y número de registros, y avisa en Discord cuando una falla.',
   'PL', 'M', ARRAY['devops','data'], 'mediano', '{}', 180),

  (gen_random_uuid(), 'PL-10', 'Límite de tasa en las rutas públicas de lectura',
   'Hoy solo el POST de reportes tiene límite. El día que nos enlacen desde un medio grande, el listado del mapa tumba la API.',
   'Las rutas públicas de lectura tienen límite por IP y devuelven 429 con Retry-After, verificado con una prueba de carga.',
   'PL', 'S', ARRAY['devops','backend'], 'corto', '{}', 190),

  (gen_random_uuid(), 'PL-11', 'Pruebas de extremo a extremo del flujo de reporte',
   'Lo más usado del sitio es lo menos probado: abrir el mapa, tocar un punto, reportar y ver el marcador no lo cubre ninguna prueba automática.',
   'Una prueba de navegador cubre reportar un rescate y una necesidad, y corre en CI.',
   'PL', 'M', ARRAY['frontend'], 'mediano', '{}', 200)

ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  acceptance = EXCLUDED.acceptance,
  priority = EXCLUDED.priority,
  size = EXCLUDED.size,
  roles = EXCLUDED.roles,
  horizon = EXCLUDED.horizon,
  depends_on = EXCLUDED.depends_on,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
