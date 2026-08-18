-- La vista de auditoría, y lo que descubrió al encenderse.
--
-- Contraloría, Procuraduría y Defensoría coinciden en pedir la misma palabra: **trazabilidad**. La
-- Procuraduría está en los PMU de cinco departamentos vigilando la entrega, y la Defensoría pidió
-- que toda la ayuda pase por salas de crisis y PMU justamente para que quede rastro.
--
-- La respuesta honesta a esa petición incluye los eslabones en cero. Un ente de control tiene que
-- poder distinguir «no se entregó ayuda» de «se entregó y no quedó registrada aquí», y un cero
-- escondido convierte la segunda cosa en la primera.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Trazabilidad auditable de la ayuda', 'parcial',
  'Publicado el 18/08 en pulso.my/auditoria#trazabilidad y en '
  || '/v1/public/incidents/colombia-2026/aid-traceability. Público y sin sesión a propósito: quien '
  || 'audita no debería tener que pedirnos una cuenta para verificar una cifra nuestra. '
  || 'Es `parcial` y no `listo` porque **los cuatro eslabones están en cero**: no hay zonas '
  || 'operativas ni equipos dados de alta, así que la cadena está vacía de origen. Lo que sí tiene '
  || 'dato es el carril del dinero (733 contratos de SECOP II) y el de integridad de los cortes.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Trazabilidad auditable de la ayuda'
);

-- Lo que la vista encontró en cuanto se dibujó, y que nadie había mirado.
--
-- 227 cortes publicados y **ninguno enlazado al anterior**. Cada uno llevaba su hash, así que se
-- podía comprobar que *ese* corte no había cambiado — pero no que la serie estuviera completa. Un
-- corte borrado no dejaba hueco y nadie podía demostrar que faltó.
--
-- Ya está arreglado en `apps/worker/src/publish-situation-report.ts`: cada corte nuevo apunta al
-- anterior. Los 227 viejos se quedan sin enlace, porque encadenarlos hacia atrás exigiría reescribir
-- lo ya publicado y eso es exactamente lo que la cadena existe para hacer imposible. El contador
-- sube desde el 18/08.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Cadena verificable de cortes publicados', 'parcial',
  'Arreglado el 18/08: cada corte publicado apunta al anterior, así que la serie —no solo cada '
  || 'corte— se puede verificar completa. Los 227 cortes anteriores se quedan sin enlace y eso se '
  || 'dice en la página en vez de disimularse. Sigue `parcial` porque **ningún corte está anclado '
  || 'fuera de Pulso**: mientras eso siga así, la comprobación se hace contra nosotros mismos y no '
  || 'es verificación independiente. Eso es `PL-6`.',
  'PL-6', now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Cadena verificable de cortes publicados'
);

-- `PL-6` sube de prioridad en la nota, no en el código: ahora hay una página pública que dice, con
-- un cero a la vista, que la verificación no es independiente todavía. Eso lo convierte en una
-- promesa pendiente y no en una idea del backlog.
UPDATE project_tasks SET
  summary = coalesce(summary || ' ', '')
    || '**Actualizado el 18/08:** la vista de auditoría en pulso.my/auditoria#trazabilidad ya '
    || 'publica «anclados fuera de Pulso: 0», así que el hueco está a la vista de cualquiera que '
    || 'audite. Mientras siga en cero, la cadena de hashes se verifica contra nosotros mismos. Este '
    || 'ticket es lo que convierte esa comprobación en independiente.',
  updated_at = now()
WHERE code = 'PL-6';
