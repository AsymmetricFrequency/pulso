-- Que el hogar pueda decir «eso no me llegó».
--
-- El modelo tenía tres estados —declarada, confirmada, verificada— y los tres son formas de decir
-- que sí. **Faltaba el que de verdad audita.** Sin él, un hogar que abre la página y ve registrada
-- una entrega que nunca recibió no tiene dónde decirlo, y el sistema solo puede recoger buenas
-- noticias.
--
-- Una entrega rechazada por quien debía recibirla es la señal más valiosa que este sistema puede
-- producir: es la única que no puede venir de quien tiene interés en que la cifra suba.
ALTER TABLE household_aid_deliveries
  DROP CONSTRAINT IF EXISTS household_aid_deliveries_confirmation_check;

ALTER TABLE household_aid_deliveries
  ADD CONSTRAINT household_aid_deliveries_confirmation_check CHECK (
    confirmation IN ('declarada', 'confirmada', 'verificada', 'rechazada')
  );

-- Lo que dijo el hogar al rechazarla. Opcional: alguien puede no querer explicar, y exigirle una
-- explicación para poder desmentir a quien registró la entrega sería ponerle la carga al lado
-- equivocado.
ALTER TABLE household_aid_deliveries
  ADD COLUMN IF NOT EXISTS household_note text CHECK (
    household_note IS NULL OR char_length(btrim(household_note)) BETWEEN 3 AND 500
  );

COMMENT ON COLUMN household_aid_deliveries.confirmation IS
  'declarada: lo dice quien entregó. confirmada: el hogar lo confirmó con su código. verificada: '
  'un tercero lo comprobó. rechazada: el hogar dice que NO lo recibió — la señal más valiosa del '
  'sistema, porque es la única que no puede venir de quien quiere que la cifra suba.';

-- La cobertura publicable cuenta también los rechazos. Publicar solo las confirmadas convertiría
-- esta vista en propaganda.
-- `CREATE OR REPLACE` no puede insertar columnas en medio de una vista existente, así que se
-- reemplaza entera. Nada depende de ella todavía.
DROP VIEW IF EXISTS aid_delivery_coverage;
CREATE VIEW aid_delivery_coverage AS
SELECT
  t.external_code AS divipola,
  t.name AS municipality,
  count(DISTINCT d.registration_id) AS households_reached,
  count(*) AS deliveries,
  count(*) FILTER (WHERE d.confirmation = 'confirmada') AS confirmed_by_household,
  count(*) FILTER (WHERE d.confirmation = 'verificada') AS independently_verified,
  count(*) FILTER (WHERE d.confirmation = 'rechazada') AS disputed_by_household,
  count(*) FILTER (WHERE d.confirmation = 'declarada') AS only_declared,
  count(*) FILTER (WHERE d.contract_id IS NOT NULL) AS traced_to_contract,
  max(d.delivered_at) AS last_delivery_at
FROM household_aid_deliveries d
JOIN household_self_registrations r ON r.id = d.registration_id
LEFT JOIN territories t ON t.id = r.territory_id
WHERE r.redacted_at IS NULL
GROUP BY t.external_code, t.name;
