-- El censo comunitario, la identidad visual y la navegación entran al tablero.
--
-- `P1-1` **no se toca**. Sigue tomado por JFernandez y sigue siendo otra cosa: aquel es el
-- expediente de operaciones —una persona autorizada registra a un hogar y le hace seguimiento— y
-- esto es autoinscripción ciudadana. Se parecen lo suficiente como para que alguien construya dos
-- veces lo mismo si nadie lo dice, así que queda dicho aquí y en su hilo.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Censo comunitario con autoinscripción', 'listo',
  'Publicado el 18/08 en pulso.my/necesito-ayuda. **No es el Registro Único de Damnificados y no da '
  || 'derecho a ninguna ayuda** — el aviso aparece tres veces: en la advertencia del paso, en el '
  || 'consentimiento al firmar y en el recibo. La pregunta central es «¿ya los censó alguna '
  || 'brigada?», y con los «no» se arma la lista que se le entrega a la alcaldía, por barrio. '
  || 'Consentimiento versionado en `consent_texts`; nombre, teléfono y documento cifrados con '
  || 'AES-256-GCM; ocho campos y no los cuarenta del RUD; sin dirección exacta; cinco registros por '
  || 'hora por IP. El borrado con código vacía los datos personales y conserva los conteos, y eso '
  || 'es una restricción CHECK y no una ruta de código.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Censo comunitario con autoinscripción'
);

-- Lo que falta del censo comunitario, y no es programación.
INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Revisión jurídica del consentimiento', 'falta',
  'El texto al que consiente quien se registra está escrito y versionado, pero **no lo ha leído '
  || 'nadie con criterio jurídico**. Tiene consecuencias reales bajo la Ley 1581 de 2012 y conviene '
  || 'revisarlo antes de que se registre la primera familia de verdad. Cambiarlo es insertar una '
  || 'versión nueva en `consent_texts`, nunca editar la fila existente: las filas que ya apuntan a '
  || 'la versión 1 son la prueba de a qué consintió esa gente.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P1' AND name = 'Revisión jurídica del consentimiento'
);

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P2', 'Navegación e identidad visual', 'listo',
  'Rehechas el 18/08. La navegación pasa de once enlaces planos —con las anclas muertas en cuatro '
  || 'de las cinco páginas— a cuatro caminos por intención, con el botón de reportar siempre '
  || 'visible y un panel de menú de verdad. La identidad sale del sismógrafo: papel frío, un solo '
  || 'acento, IBM Plex en tres cortes servidas desde nuestro dominio. Medido con el detector '
  || '`impeccable`: de **94 anti-patrones a 31** antes del último pase de identidad.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities
  WHERE priority = 'P2' AND name = 'Navegación e identidad visual'
);

-- Un ticket para el trabajo que el censo comunitario hace posible y que todavía no existe.
INSERT INTO project_tasks (
  id, code, title, summary, acceptance, priority, size, roles, horizon, status,
  depends_on, sort_order, created_at, updated_at, technical
)
SELECT gen_random_uuid(), 'P1-6',
  'Entregarle a una alcaldía la lista de hogares sin censar',
  'El censo comunitario ya recoge la respuesta a «¿ya los censó alguna brigada?». Lo que falta es '
  || 'la otra punta: una vista en Operaciones que agrupe por municipio y barrio los hogares que '
  || 'dijeron que no, y produzca algo que se le pueda entregar a una alcaldía. Sin esto, el '
  || 'registro recoge datos que no llegan a nadie — que es la peor forma posible de pedirle sus '
  || 'datos a una familia.',
  'Desde Operaciones se genera, para un municipio, la lista de hogares que declaran no haber sido '
  || 'censados, agrupada por barrio y con el conteo de personas y de condiciones prioritarias. Los '
  || 'datos de contacto solo aparecen para quien tenga rol de coordinación, y queda registrado '
  || 'quién los consultó.',
  'P1', 'M', ARRAY['backend', 'frontend'], 'urgente', 'libre',
  ARRAY[]::text[], 42, now(), now(),
  '**Dónde:** `apps/api/src/postgres-household-registry-repository.ts` ya tiene el índice parcial '
  || '`household_self_registrations_uncensused_idx` hecho para esta consulta.' || chr(10) || chr(10)
  || '**La decisión de privacidad, y es la del ticket:** el agregado por barrio no necesita ningún '
  || 'dato personal y debería poder salir sin descifrar nada. El contacto es otra cosa: descifrarlo '
  || 'es una operación distinta, con rol de coordinación y con registro de quién lo hizo. No las '
  || 'mezcles en la misma consulta — el puerto de dominio las separó a propósito.' || chr(10)
  || chr(10)
  || '**Y una pregunta que hay que responder antes de entregar nada:** ¿en qué formato lo quiere '
  || 'recibir la alcaldía? Preguntarlo es más barato que adivinarlo y rehacerlo. Va de la mano de '
  || '`P1-4`.'
WHERE NOT EXISTS (SELECT 1 FROM project_tasks WHERE code = 'P1-6');
