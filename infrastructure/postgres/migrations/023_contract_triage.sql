-- Pre-lectura automática del objeto contractual, para ordenar la cola de revisión.
--
-- El problema que resuelve es de escala, no de criterio: hay 356 contratos sin revisar y la cola
-- solo sabe ordenarlos por monto, así que quien revisa lee contratos de aseo y de papelería antes
-- de llegar al de remoción de escombros. El clasificador por palabras clave no ayuda —de 357
-- devolvió un único candidato y era un albergue de animales (ver `29-public-funds-p0.md`)—.
--
-- Estas columnas guardan lo que un modelo opina tras leer el objeto, y viven **aparte** de
-- `emergency_relevance` a propósito. Ese campo es la decisión humana; esto es una lectura previa.
-- Hasta el vocabulario es distinto (`likely`/`unlikely`/`unclear` en vez de
-- `confirmed`/`unrelated`) para que nadie confunda una opinión con un veredicto ni escriba una
-- consulta que sume lo que un modelo supuso. Las cifras públicas siguen sumando solo lo confirmado
-- por una persona.
ALTER TABLE contracts
  ADD COLUMN triage_verdict text
    CHECK (triage_verdict IN ('likely', 'unlikely', 'unclear')),
  -- Qué tan seguro dice estar, de 0 a 1. Ordena dentro de cada veredicto; no lo sustituye.
  ADD COLUMN triage_confidence numeric(3, 2)
    CHECK (triage_confidence >= 0 AND triage_confidence <= 1),
  -- La razón, en español y en una frase. Es lo único de aquí que le sirve a quien revisa: le dice
  -- qué mirar en el objeto. Un veredicto sin razón obligaría a releer el contrato entero igual.
  ADD COLUMN triage_rationale text,
  -- Procedencia, igual que para cualquier otra fuente del proyecto: qué modelo lo dijo y cuándo.
  -- Sin esto no hay forma de revisar una tanda cuando se cambie de modelo o de instrucción.
  ADD COLUMN triage_model text,
  ADD COLUMN triage_at timestamptz;

-- La cola de revisión, ya ordenada por la lectura previa: primero lo que parece de la emergencia,
-- y dentro de eso por monto. `triage_at IS NULL` es además el marcador de reanudación del trabajo
-- que llena estas columnas, para que una corrida interrumpida no vuelva a pagar lo ya leído.
CREATE INDEX contracts_triage_queue_idx
  ON contracts(incident_id, triage_verdict, total_value DESC)
  WHERE reviewed_at IS NULL;
