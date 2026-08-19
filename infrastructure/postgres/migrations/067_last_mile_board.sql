-- El estado real de la última milla, en el tablero.

INSERT INTO project_capabilities (id, priority, name, status, note, task_code, updated_at)
SELECT gen_random_uuid(), 'P1', 'Última milla del dinero público', 'parcial',
  'Publicado el 18/08 en pulso.my/auditoria. La escalera de `funding_flows` terminaba en '
  || '`verified_in_territory` y la página lo rotulaba «Verificado en territorio» desde que existe, '
  || 'pero **nada en el sistema podía producir ese valor**: no había ningún camino que llegara '
  || 'ahí. Ahora lo hay y cuesta lo que debe costar — un trigger exige que al menos un hogar haya '
  || 'confirmado, con su código, haber recibido algo de ese contrato. No lo sube quien ejecuta ni '
  || 'quien contrata. **Parcial y no listo** porque hoy los tres peldaños de abajo marcan cero: '
  || 'hay 33 contratos candidatos con $255.840.200 rastreados y ninguna entrega anotada todavía.',
  NULL, now()
WHERE NOT EXISTS (
  SELECT 1 FROM project_capabilities WHERE priority='P1' AND name='Última milla del dinero público'
);

-- La revisión de contratos es lo que hoy bloquea la cifra de arriba, y conviene que el tablero lo
-- diga con el número exacto en vez de dejarlo en «pendiente».
UPDATE project_capabilities
SET note = note || ' **Al 18/08 hay 0 contratos confirmados por una persona**, 33 marcados como '
  || 'candidatos por el clasificador y 829 sin revisar de 862 ingeridos. Mientras eso siga así, la '
  || 'escalera de montos por etapa se publica vacía: filtra por `confirmed` y no hay ninguno.',
  updated_at = now()
WHERE priority IN ('P0', 'P1')
  AND name ILIKE '%contrato%'
  AND note NOT ILIKE '%0 contratos confirmados por una persona%';

SELECT priority, name, status FROM project_capabilities ORDER BY priority, name;
