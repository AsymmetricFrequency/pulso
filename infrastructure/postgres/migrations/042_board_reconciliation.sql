-- Poner de acuerdo el tablero con la realidad.
--
-- El inventario de capacidades y la lista de tickets se llevaban actualizando por separado, y se
-- desincronizaron: hay capacidades en «listo» cuyo ticket sigue en «libre». Eso no es un detalle de
-- contabilidad — es la trampa exacta que hace que alguien tome un ticket, dedique una tarde y
-- descubra que lo que iba a construir ya existe.

-- ── PL-3 · Panel de administración con Discord ────────────────────────────────────────────────
-- Su criterio de aceptación es «un Maintainer entra con Discord, ve rescates abiertos y estado de
-- fuentes, y asigna un ticket a un miembro». Las cuatro cosas funcionan en admin.pulso.my y se
-- vienen usando a diario: las asignaciones de los diez tickets de ayer se hicieron desde ahí.
UPDATE project_tasks SET
  status = 'hecho',
  summary = 'Entrar con Discord, que el rol del servidor sea el permiso en Pulso, y ver el estado '
    || 'de la operación en una pantalla. **Hecho y en uso en admin.pulso.my**: sesión por OAuth de '
    || 'Discord, roles del servidor como permisos, pulso de la operación, tablero de tickets y '
    || 'publicación de hilos en #tareas. Diseño en docs/34-discord.md.',
  updated_at = now()
WHERE code = 'PL-3';

-- ── PL-9 · Panel de estado de las ingestas ────────────────────────────────────────────────────
-- Este NO está hecho, aunque su capacidad diga «listo». Su aceptación pide dos cosas y solo una
-- existe: el panel sí muestra cada fuente con su última corrida, pero **nadie avisa cuando una
-- falla**. El worker no manda notificaciones de ningún tipo — se comprobó buscando en su código.
--
-- La capacidad baja a «parcial», que es lo que de verdad es. Y el ticket se reescribe para que
-- quien lo tome no reconstruya la mitad que ya está.
UPDATE project_tasks SET
  summary = 'La mitad ya existe: el panel de Operaciones muestra cada fuente con su última corrida, '
    || 'resultado y número de registros. Lo que falta es el aviso: **el worker no notifica nada**, '
    || 'así que una ingesta que deja de responder se descubre tarde y por casualidad. Cali lleva 68 '
    || 'corridas fallidas seguidas y nadie se enteró por un aviso.',
  technical = E'**Lo que NO hay que construir**\n'
    'El panel ya está: `postgres-admin-repository.ts` consulta la última corrida de cada fuente y '
    '`admin-panel.tsx` la pinta. No lo rehagas.\n\n'
    '**Lo que falta**\n'
    'El worker no tiene cliente de Discord. `DiscordClient.alert()` vive en la API y solo lo llama '
    '`admin-routes.ts` al asignar un ticket. Hace falta que `runIngestionSourceWithLog` avise cuando '
    'una corrida termina en `failed`.\n\n'
    '**Antes de empezar**\n'
    'Comprueba que `DISCORD_WEBHOOK_ALERTS` esté en `/opt/pulso/.env` y que exista el canal '
    '`#alertas`. Sin eso `alert()` hace `return` en la primera línea y no manda nada — silencioso a '
    'propósito, porque una alerta rota nunca puede tumbar la ingesta que la originó.\n\n'
    '**Ojo con el ruido**\n'
    'Cali falla cada 30 minutos por diseño (403 conocido). Avisar en cada corrida convierte el canal '
    'en ruido que la gente silencia, y entonces el aviso que importa tampoco llega. Avisa en el '
    '**cambio de estado** —cuando una fuente que funcionaba deja de funcionar— no en cada fallo.',
  updated_at = now()
WHERE code = 'PL-9';

UPDATE project_capabilities SET
  status = 'parcial',
  note = 'El panel muestra la última corrida de cada fuente. Falta el aviso: el worker no notifica '
    || 'nada, así que una ingesta caída se descubre por casualidad.',
  updated_at = now()
WHERE name = 'Estado de las fuentes de ingesta';

-- ── Enlace obsoleto ───────────────────────────────────────────────────────────────────────────
-- «Daños estructurales fuera de Cali» apuntaba a P0-9 cuando ese ticket era «pedirle los datos a
-- mapadelterremoto». Los datos ya están —1.089 puntos— y P0-9 pasó a ser otra cosa: pedirles una
-- licencia. La capacidad está cumplida y ya no depende de ese ticket.
UPDATE project_capabilities SET task_code = NULL, updated_at = now()
WHERE name = 'Daños estructurales fuera de Cali';

-- Y el panel administrativo, que estaba «listo» sin ticket asociado, ahora apunta al suyo.
UPDATE project_capabilities SET task_code = 'PL-3', updated_at = now()
WHERE name = 'Panel administrativo con Discord';
