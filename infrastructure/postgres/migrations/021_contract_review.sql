-- Revisión humana de la relevancia de un contrato.
--
-- El clasificador automático nunca confirma: su techo es `probable` porque un contador de palabras
-- no distingue un albergue de damnificados de un albergue de animales (ver `29-public-funds-p0.md`).
-- Sin estas columnas el resumen público de recursos se queda en cero para siempre, porque solo
-- suma lo confirmado y nadie tiene forma de confirmar nada.
ALTER TABLE contracts
  ADD COLUMN reviewed_by_actor_id uuid REFERENCES actors(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_notes text;

-- La cola de revisión se ordena por lo que falta, y dentro de eso por monto: revisar primero el
-- contrato de siete mil millones rinde más que revisar el de cinco.
CREATE INDEX contracts_review_queue_idx
  ON contracts(incident_id, emergency_relevance, total_value DESC)
  WHERE reviewed_at IS NULL;
