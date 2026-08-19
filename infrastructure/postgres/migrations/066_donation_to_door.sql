-- El último peldaño de la escalera del dinero solo se sube desde una puerta.
--
-- `funding_flows.stage` es una escalera de diez peldaños que termina en `verified_in_territory`, y
-- la página pública ya lo rotula «Verificado en territorio» desde que existe. **Nada en el sistema
-- puede producir ese valor.** No es que esté vacío por falta de datos: es que no hay ningún camino
-- por el que una fila pudiera llegar ahí legítimamente, porque hasta la semana pasada no existía
-- nada que supiera si algo llegó a una puerta.
--
-- Un peldaño que la interfaz promete y el sistema no puede alcanzar es peor que no tenerlo. O se
-- puede subir con una prueba, o se quita.
--
-- Esta migración lo hace subible, y le pone el precio correcto: **la única prueba que vale es que
-- un hogar diga que recibió**. No la palabra de quien entregó, no la de quien contrató, no la
-- nuestra.

-- ## 1. De qué donación salió lo que llegó a esta puerta
--
-- `household_aid_deliveries` ya guarda `contract_id` —para el gasto público— y `funding_source`
-- como texto libre, que es lo que se escribe a las nueve de la noche al lado de una puerta. Falta
-- lo que viene por el otro lado: la donación.
--
-- Nulo es el caso normal y así debe ser. La mayor parte de lo que se entrega en una emergencia sale
-- de recursos propios de quien entrega, y exigir que toda entrega apunte a una donación haría que
-- no se registrara ninguna. Esta columna existe para cuando **sí** se sabe.
ALTER TABLE household_aid_deliveries
  ADD COLUMN IF NOT EXISTS donation_commitment_id uuid REFERENCES donation_commitments(id);

CREATE INDEX IF NOT EXISTS household_aid_deliveries_donation_idx
  ON household_aid_deliveries(donation_commitment_id)
  WHERE donation_commitment_id IS NOT NULL;

COMMENT ON COLUMN household_aid_deliveries.donation_commitment_id IS
  'De qué donación salió lo que llegó a esta puerta. Nulo es el caso normal: la mayoría de la ayuda '
  'sale de recursos propios de quien entrega, y exigirlo haría que no se registrara nada.';

-- ## 2. El peldaño que hay que ganarse
--
-- Un contrato no queda «verificado en territorio» porque alguien lo escriba. Queda verificado
-- cuando al menos un hogar dijo, con su código y por su cuenta, que le llegó algo de ese contrato.
--
-- Va como trigger y no como comprobación de la aplicación por la misma razón de siempre: el día que
-- alguien haga un UPDATE desde una consola —con prisa, de buena fe, para «arreglar» la cifra— el
-- código de la aplicación no está.
--
-- **Se exige `contract_id`.** Se podría haber aceptado el territorio como vínculo —«hubo una
-- entrega confirmada en este municipio»— pero eso dejaría que un flujo se declare verificado porque
-- otra organización, con otro dinero, entregó algo en el mismo municipio. Ese peldaño no vale nada
-- si se puede subir con la ejecución ajena.
CREATE OR REPLACE FUNCTION pulso_assert_territory_verification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  confirmations integer;
BEGIN
  IF NEW.stage <> 'verified_in_territory' THEN
    RETURN NEW;
  END IF;

  IF NEW.contract_id IS NULL THEN
    RAISE EXCEPTION
      'Un flujo sin contrato no puede quedar «verificado en territorio»: no hay forma de saber qué '
      'entrega lo comprueba.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)
    INTO confirmations
  FROM household_aid_deliveries d
  JOIN household_self_registrations r ON r.id = d.registration_id
  WHERE d.contract_id = NEW.contract_id
    AND d.confirmation IN ('confirmada', 'verificada')
    AND r.redacted_at IS NULL;

  IF confirmations = 0 THEN
    RAISE EXCEPTION
      'Ningún hogar ha confirmado haber recibido algo de ese contrato. «Verificado en territorio» '
      'es el único peldaño que no lo sube quien ejecuta: lo sube quien recibe.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funding_flows_territory_verification ON funding_flows;
CREATE TRIGGER funding_flows_territory_verification
  BEFORE INSERT OR UPDATE ON funding_flows
  FOR EACH ROW
  EXECUTE FUNCTION pulso_assert_territory_verification();

COMMENT ON FUNCTION pulso_assert_territory_verification() IS
  'El peldaño «verificado en territorio» solo se sube si un hogar confirmó, con su código, haber '
  'recibido algo de ese contrato. Vive en la base para que sobreviva a cualquier ruta futura.';

-- ## 3. Dónde se rompe la cadena
--
-- La vista no está para decir cuánto se ejecutó. Está para decir **hasta dónde se puede comprobar**
-- y en qué peldaño se acaba la prueba, que casi nunca es el mismo sitio.
--
-- Hoy responde cero en las tres últimas columnas. Ese cero es el dato: significa que de todo el
-- dinero rastreado no hay un solo peso que llegue a una puerta que lo confirme. No es un fallo de
-- la vista.
-- **No cuelga de la etapa `paid`.** SECOP II publica lo contratado, no lo pagado: hoy los 862
-- flujos están en `contracted` y ninguno llegará nunca a `paid` desde esa fuente. Una vista que
-- midiera pagos diría «sin flujo registrado» sobre 862 contratos que sí tienen flujo — mentiría en
-- la dirección cómoda, la de que no hay nada que revisar. Mide el peldaño más alto alcanzado, que
-- es el dato que de verdad existe.
-- El agregado de abajo cuelga de esta vista, así que se suelta primero. Reaplicar esta migración
-- sobre una base donde ya existe tiene que funcionar igual que sobre una vacía.
DROP VIEW IF EXISTS funding_execution_gap;
DROP VIEW IF EXISTS funding_last_mile;
CREATE VIEW funding_last_mile AS
WITH ladder AS (
  SELECT ARRAY[
    'announced', 'appropriated', 'available', 'committed', 'in_procurement',
    'contracted', 'obligated', 'paid', 'delivered', 'verified_in_territory'
  ] AS stages
),
ranked AS (
  SELECT
    f.contract_id,
    f.stage,
    f.amount,
    f.currency,
    f.occurred_at,
    row_number() OVER (
      PARTITION BY f.contract_id
      ORDER BY array_position(l.stages, f.stage) DESC, f.occurred_at DESC
    ) AS rung
  FROM funding_flows f
  CROSS JOIN ladder l
  WHERE f.contract_id IS NOT NULL
),
flow AS (
  SELECT
    contract_id,
    stage AS furthest_stage,
    amount AS tracked_amount,
    currency,
    occurred_at AS last_flow_at
  FROM ranked
  WHERE rung = 1
),
door AS (
  SELECT
    d.contract_id,
    count(*) AS deliveries_recorded,
    count(DISTINCT d.registration_id) AS households_reached,
    count(*) FILTER (WHERE d.confirmation IN ('confirmada', 'verificada')) AS confirmed_by_household,
    count(*) FILTER (WHERE d.confirmation = 'rechazada') AS denied_by_household
  FROM household_aid_deliveries d
  JOIN household_self_registrations r ON r.id = d.registration_id
  WHERE d.contract_id IS NOT NULL
    AND r.redacted_at IS NULL
  GROUP BY d.contract_id
)
SELECT
  c.incident_id,
  c.id AS contract_id,
  c.reference,
  c.emergency_relevance,
  flow.furthest_stage,
  flow.tracked_amount,
  flow.currency,
  flow.last_flow_at,
  coalesce(door.deliveries_recorded, 0) AS deliveries_recorded,
  coalesce(door.households_reached, 0) AS households_reached,
  coalesce(door.confirmed_by_household, 0) AS confirmed_by_household,
  coalesce(door.denied_by_household, 0) AS denied_by_household,
  -- El peldaño donde se acaba la prueba, dicho en una palabra.
  CASE
    WHEN coalesce(door.denied_by_household, 0) > 0 THEN 'desmentido'
    WHEN coalesce(door.confirmed_by_household, 0) > 0 THEN 'confirmado_por_el_hogar'
    WHEN coalesce(door.deliveries_recorded, 0) > 0 THEN 'declarado_por_quien_entrego'
    WHEN flow.furthest_stage IS NOT NULL THEN 'sin_rastro_de_entrega'
    ELSE 'sin_flujo_registrado'
  END AS evidence_stops_at
FROM contracts c
LEFT JOIN flow ON flow.contract_id = c.id
LEFT JOIN door ON door.contract_id = c.id;

COMMENT ON VIEW funding_last_mile IS
  'Hasta dónde se puede comprobar cada contrato, no cuánto se ejecutó. `evidence_stops_at` dice en '
  'qué peldaño se acaba la prueba; `desmentido` gana sobre `confirmado` a propósito.';

-- ## 4. La cifra de una sola línea
--
-- La pregunta que hace un ciudadano —«¿de la plata que se movió, cuánto llegó a una puerta que lo
-- diga?»— cabe en una fila. Sin identificar a nadie: solo conteos y sumas.
--
-- **`denied_amount` está aparte y no se resta.** Un desmentido no es una corrección contable, es una
-- denuncia sin resolver; meterlo dentro de la cifra confirmada la volvería más limpia de lo que es,
-- y restarlo daría por cierto un desmentido que todavía nadie ha revisado.
--
-- **Va desglosada por relevancia y no suma una sola cifra**, porque las tres poblaciones no son lo
-- mismo y juntarlas mentiría: hoy hay 0 contratos que una persona haya confirmado como de la
-- emergencia, 33 que un clasificador marcó como probables y 829 sin revisar. Una sola cifra
-- obligaría a elegir entre publicar $0 —que esconde los 33— o publicar los 33 como si alguien los
-- hubiera revisado. Desglosada, quien lee decide qué está mirando.
DROP VIEW IF EXISTS funding_execution_gap;
CREATE VIEW funding_execution_gap AS
SELECT
  incident_id,
  emergency_relevance,
  count(*) FILTER (WHERE furthest_stage IS NOT NULL) AS contracts_with_flow,
  coalesce(sum(tracked_amount), 0) AS tracked_total,
  count(*) FILTER (WHERE deliveries_recorded > 0) AS contracts_with_any_delivery,
  count(*) FILTER (WHERE confirmed_by_household > 0) AS contracts_confirmed_at_a_door,
  coalesce(sum(tracked_amount) FILTER (WHERE confirmed_by_household > 0), 0) AS confirmed_amount,
  count(*) FILTER (WHERE denied_by_household > 0) AS contracts_denied_at_a_door,
  coalesce(sum(tracked_amount) FILTER (WHERE denied_by_household > 0), 0) AS denied_amount,
  coalesce(sum(households_reached), 0) AS households_reached
FROM funding_last_mile
GROUP BY incident_id, emergency_relevance;

COMMENT ON VIEW funding_execution_gap IS
  'De la plata que se movió, cuánto llegó a una puerta que lo confirme, desglosado por relevancia '
  'para no mezclar lo que revisó una persona con lo que marcó un clasificador. El monto desmentido '
  'va aparte y no se resta: es una denuncia sin resolver, no una corrección contable.';

SELECT * FROM funding_execution_gap;
