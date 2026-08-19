-- Enlazar la donación con la entrega real. El eslabón que cierra la cadena.
--
-- La cadena ya existe entera —`necesidad → asignación → despacho → entrega`— y los contratos
-- públicos están rastreados. Lo que falta es el último enlace y es el que de verdad importa:
-- **qué hogar recibió qué**. Sin él, «entregamos 400 kits» es una cifra que nadie puede comprobar,
-- que es exactamente lo que la vista de auditoría dice hoy con su cero.
--
-- ## La regla que hace esto legal
--
-- Un hogar solo puede aparecer aquí si autorizó la finalidad `entrega_ayuda`. No es una
-- comprobación en el código de la aplicación: es una **restricción de la base**, porque el día que
-- alguien escriba un INSERT desde una consola —para arreglar algo, con prisa, de buena fe— la
-- comprobación del código no está.
CREATE TABLE household_aid_deliveries (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),

  registration_id uuid NOT NULL REFERENCES household_self_registrations(id) ON DELETE CASCADE,
  -- La entrega del inventario, cuando venga de ahí. Nula cuando la ayuda la entregó una
  -- organización con recursos propios, que es la mayoría de lo que ocurre en una emergencia: exigir
  -- que todo pase por nuestro inventario haría que no se registrara nada.
  aid_delivery_id uuid REFERENCES aid_deliveries(id),

  -- Qué llegó, en palabras. No un catálogo cerrado: quien registra una entrega a las nueve de la
  -- noche no va a buscar el código del artículo.
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 3 AND 300),
  quantity numeric(14, 2) CHECK (quantity IS NULL OR quantity > 0),
  unit text,

  -- Quién la entregó. Una organización con nombre, no «un voluntario»: si nadie responde por una
  -- entrega, no se puede auditar.
  delivered_by text NOT NULL CHECK (char_length(btrim(delivered_by)) BETWEEN 3 AND 200),
  delivered_by_actor_id uuid REFERENCES actors(id),

  /*
   * Cómo se sabe que llegó. Tres niveles y el orden es el de la confianza:
   *
   * · `declarada`      — lo dice quien entregó, y nadie más.
   * · `confirmada`     — el hogar lo confirmó con su código.
   * · `verificada`     — un tercero identificado lo comprobó.
   *
   * La distinción es la misma que ya hace `aid_deliveries` para las entregas del inventario, y
   * existe por lo mismo: quien entrega diciendo que entregó no es una comprobación.
   */
  confirmation text NOT NULL DEFAULT 'declarada'
    CHECK (confirmation IN ('declarada', 'confirmada', 'verificada')),
  confirmed_at timestamptz,

  -- El origen del recurso, para poder recorrer la cadena hacia atrás: de qué donación o contrato
  -- salió lo que llegó a esta puerta.
  funding_source text,
  contract_id uuid REFERENCES contracts(id),

  delivered_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX household_aid_deliveries_registration_idx
  ON household_aid_deliveries(registration_id, delivered_at DESC);
CREATE INDEX household_aid_deliveries_incident_idx
  ON household_aid_deliveries(incident_id, delivered_at DESC);
CREATE INDEX household_aid_deliveries_contract_idx
  ON household_aid_deliveries(contract_id) WHERE contract_id IS NOT NULL;

COMMENT ON TABLE household_aid_deliveries IS
  'Qué recibió cada hogar y de dónde salió. Solo puede haber filas de hogares que autorizaron la '
  'finalidad `entrega_ayuda`: lo impone un trigger, no el código de la aplicación.';

-- ## La restricción de finalidad, como trigger
--
-- Un CHECK no puede mirar otra tabla, así que va aquí. Es la misma idea: la regla vive en la base
-- para que sobreviva a cualquier ruta que se escriba después.
CREATE OR REPLACE FUNCTION pulso_assert_aid_purpose()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  authorized boolean;
BEGIN
  SELECT 'entrega_ayuda' = ANY (consent_purposes) AND redacted_at IS NULL
    INTO authorized
  FROM household_self_registrations
  WHERE id = NEW.registration_id;

  IF authorized IS NOT TRUE THEN
    RAISE EXCEPTION
      'Ese hogar no autorizó ser contactado para recibir ayuda (finalidad entrega_ayuda), o pidió '
      'el borrado de sus datos. Registrar una entrega a su nombre usaría el dato para algo que no '
      'consintió.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER household_aid_deliveries_purpose_check
  BEFORE INSERT OR UPDATE ON household_aid_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION pulso_assert_aid_purpose();

-- ## Lo que se publica
--
-- Agregado y sin nadie identificable. La pregunta que un ente de control hace —«¿cuánto de lo que
-- se contrató llegó a una puerta?»— se responde sin decir de quién es la puerta.
CREATE VIEW aid_delivery_coverage AS
SELECT
  t.external_code AS divipola,
  t.name AS municipality,
  count(DISTINCT d.registration_id) AS households_reached,
  count(*) AS deliveries,
  count(*) FILTER (WHERE d.confirmation = 'confirmada') AS confirmed_by_household,
  count(*) FILTER (WHERE d.confirmation = 'verificada') AS independently_verified,
  count(*) FILTER (WHERE d.contract_id IS NOT NULL) AS traced_to_contract,
  max(d.delivered_at) AS last_delivery_at
FROM household_aid_deliveries d
JOIN household_self_registrations r ON r.id = d.registration_id
LEFT JOIN territories t ON t.id = r.territory_id
WHERE r.redacted_at IS NULL
GROUP BY t.external_code, t.name;

COMMENT ON VIEW aid_delivery_coverage IS
  'Cuánta ayuda llegó a una puerta, por municipio y sin identificar a nadie. Responde «¿de lo que '
  'se contrató, qué llegó?» sin decir de quién es la puerta.';
