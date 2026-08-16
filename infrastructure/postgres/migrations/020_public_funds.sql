-- Núcleo de trazabilidad de recursos públicos (P0).
--
-- La pregunta que responde: cuánto dinero público se anunció para esta emergencia, en qué etapa
-- está cada peso, quién lo recibió y qué resultado verificable produjo en territorio.
--
-- Decisión de fondo: una cifra anunciada NO equivale a dinero disponible, contratado ni pagado.
-- Confundirlas es el error que hace inútil la mayoría de los tableros de emergencia. Por eso el
-- dinero no se guarda como un saldo sino como un recorrido de etapas (`funding_flows`), donde cada
-- transición trae su monto, su fecha y la fuente que la respalda.

-- Procedencia obligatoria (sección 4.3 del plan P0).
--
-- Va en su propia tabla y no como columnas repetidas en cada entidad porque un mismo registro de
-- origen —una fila de SECOP, un PDF de decreto— sustenta a la vez el proceso, el contrato y sus
-- flujos. Duplicar los campos obligaría a mantenerlos sincronizados a mano y el primer desajuste
-- rompería la cadena de evidencia, que es justamente lo que esta tabla existe para sostener.
CREATE TABLE provenance_records (
  id uuid PRIMARY KEY,
  source_id text NOT NULL REFERENCES external_sources(id),
  source_record_id uuid REFERENCES source_records(id),
  -- Sistema y referencia originales: con estos dos cualquiera puede volver al dato en su fuente.
  source_system text NOT NULL,
  source_reference text NOT NULL,
  source_url text,
  content_hash text NOT NULL CHECK (char_length(content_hash) = 64),
  parser_version text NOT NULL,
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  effective_at timestamptz,
  normalization_status text NOT NULL DEFAULT 'normalized'
    CHECK (normalization_status IN ('raw', 'normalized', 'needs_review', 'rejected')),
  -- Permite reconstruir una ingestión completa: todos los registros de una misma corrida.
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, source_reference, content_hash)
);

CREATE INDEX provenance_records_source_idx ON provenance_records(source_id, retrieved_at DESC);
CREATE INDEX provenance_records_correlation_idx ON provenance_records(correlation_id);

-- Origen del dinero: PGN, municipio, departamento, regalías, SGP, crédito, donación, cooperación.
CREATE TABLE funding_sources (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  code text NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'national_budget', 'departmental_budget', 'municipal_budget', 'royalties',
    'participation_system', 'own_resources', 'credit', 'donation', 'cooperation', 'other'
  )),
  -- Territorio al que pertenece la fuente, cuando aplica (una alcaldía, una gobernación).
  territory_id uuid REFERENCES territories(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, code)
);

-- Entidad pública que contrata. Se separa de `organizations` —que modela organizaciones de
-- respuesta— porque aquí la identidad relevante es la institucional del Estado y su llave natural
-- es el NIT, que es lo que permite cruzar entre SECOP, presupuesto y pagos.
CREATE TABLE public_entities (
  id uuid PRIMARY KEY,
  nit text NOT NULL UNIQUE,
  name text NOT NULL,
  order_level text CHECK (order_level IN ('national', 'departmental', 'municipal', 'other')),
  sector text,
  territory_id uuid REFERENCES territories(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Proceso de compra (SECOP u otro).
CREATE TABLE procurement_processes (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  entity_id uuid NOT NULL REFERENCES public_entities(id),
  territory_id uuid REFERENCES territories(id),
  external_id text NOT NULL,
  reference text,
  modality text,
  object text,
  status text,
  published_at timestamptz,
  source_url text,
  provenance_id uuid NOT NULL REFERENCES provenance_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, external_id)
);

CREATE INDEX procurement_processes_entity_idx ON procurement_processes(entity_id, published_at DESC);

-- Contrato.
--
-- Dos decisiones sobre la contraparte, tomadas mirando los datos reales de SECOP:
--
-- 1. El documento del proveedor solo se guarda cuando es un NIT, es decir cuando la contraparte es
--    una persona jurídica. En la contratación municipal la mayoría de contratos son de prestación
--    de servicios con personas naturales y ahí `documento_proveedor` es una cédula. Que SECOP la
--    publique no obliga a Pulso a replicarla: es el mismo dato personal que el proyecto se niega a
--    importar en cualquier otro contexto.
-- 2. Para no perder la capacidad de detectar al mismo proveedor repetido entre contratos —una de
--    las señales de revisión del plan— se guarda siempre una huella derivada del documento. Cruza
--    igual de bien y no expone el número.
--
-- Tampoco se importa nada que no sirva para rastrear el recurso y sí exponga a personas: número de
-- cuenta bancaria, ni nombre, documento, domicilio, género o nacionalidad del representante legal
-- y del supervisor.
CREATE TABLE contracts (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  entity_id uuid NOT NULL REFERENCES public_entities(id),
  process_id uuid REFERENCES procurement_processes(id),
  territory_id uuid REFERENCES territories(id),
  external_id text NOT NULL,
  reference text,
  supplier_name text NOT NULL,
  supplier_document text,
  supplier_document_type text,
  supplier_fingerprint text,
  -- Relación con la emergencia.
  --
  -- Que un contrato se haya firmado después del sismo y en un territorio afectado NO lo convierte
  -- en un contrato de la emergencia: la mayoría de lo que firma un municipio esos días es su
  -- operación ordinaria. Presentarlos juntos como "recursos de la emergencia" sería inventar una
  -- relación que no existe, así que la relevancia se marca explícitamente y las cifras públicas
  -- solo suman lo confirmado o probable, diciendo cuánto queda sin revisar.
  emergency_relevance text NOT NULL DEFAULT 'unreviewed'
    CHECK (emergency_relevance IN ('confirmed', 'probable', 'unrelated', 'unreviewed')),
  relevance_signals jsonb,
  object text,
  contract_type text,
  modality text,
  status text,
  signed_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  currency char(3) NOT NULL DEFAULT 'COP',
  -- Los tres montos que la fuente publica por contrato. Se guardan aquí además de en
  -- `funding_flows` porque son el estado actual del contrato; los flujos son su historia.
  total_value numeric(18, 2) NOT NULL DEFAULT 0 CHECK (total_value >= 0),
  invoiced_value numeric(18, 2) NOT NULL DEFAULT 0 CHECK (invoiced_value >= 0),
  paid_value numeric(18, 2) NOT NULL DEFAULT 0 CHECK (paid_value >= 0),
  source_url text,
  provenance_id uuid NOT NULL REFERENCES provenance_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, external_id)
);

CREATE INDEX contracts_incident_signed_idx ON contracts(incident_id, signed_at DESC);
CREATE INDEX contracts_territory_idx ON contracts(territory_id);
CREATE INDEX contracts_relevance_idx ON contracts(incident_id, emergency_relevance);
-- Sostiene la señal "mismo proveedor repetido en varios contratos" sin guardar cédulas.
CREATE INDEX contracts_supplier_fingerprint_idx ON contracts(incident_id, supplier_fingerprint);

-- Movimiento de valor: el dinero como recorrido, no como saldo.
--
-- El orden de las etapas es el del plan P0 y no es decorativo: es lo que permite decir "se
-- anunciaron X pero solo se contrataron Y y se pagaron Z", que es la diferencia entre informar y
-- rendir cuentas.
CREATE TABLE funding_flows (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  funding_source_id uuid REFERENCES funding_sources(id),
  entity_id uuid REFERENCES public_entities(id),
  contract_id uuid REFERENCES contracts(id),
  territory_id uuid REFERENCES territories(id),
  stage text NOT NULL CHECK (stage IN (
    'announced', 'appropriated', 'available', 'committed', 'in_procurement',
    'contracted', 'obligated', 'paid', 'delivered', 'verified_in_territory'
  )),
  amount numeric(18, 2) NOT NULL CHECK (amount >= 0),
  currency char(3) NOT NULL DEFAULT 'COP',
  occurred_at timestamptz NOT NULL,
  -- Nivel de confianza del dato y si alguien lo verificó: Pulso publica "requiere revisión",
  -- nunca una acusación.
  confidence text NOT NULL DEFAULT 'reported'
    CHECK (confidence IN ('reported', 'corroborated', 'validated')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'disputed')),
  note text,
  provenance_id uuid NOT NULL REFERENCES provenance_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Una etapa por contrato y fecha: reingerir la misma fila de la fuente actualiza en vez de
  -- duplicar el gasto, que si no inflaría las cifras públicas en cada corrida.
  UNIQUE (incident_id, contract_id, stage, occurred_at)
);

CREATE INDEX funding_flows_incident_stage_idx ON funding_flows(incident_id, stage);
CREATE INDEX funding_flows_territory_stage_idx ON funding_flows(territory_id, stage);
CREATE INDEX funding_flows_contract_idx ON funding_flows(contract_id);

-- El eslabón que cierra el ciclo: qué resultado real produjo un contrato o un pago.
--
-- Es la pieza que distingue a Pulso de un visor de contratación: SECOP termina en "pagado" y aquí
-- empieza la pregunta de si eso llegó a alguna parte. Se deja explícitamente sin poblar por
-- ingesta automática —ninguna fuente publica este vínculo— y admite varios destinos porque un
-- contrato puede terminar en una entrega, en una necesidad cerrada o en un caso de reconstrucción.
CREATE TABLE delivery_links (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  contract_id uuid REFERENCES contracts(id),
  funding_flow_id uuid REFERENCES funding_flows(id),
  aid_delivery_id uuid REFERENCES aid_deliveries(id),
  supply_need_id uuid REFERENCES supply_needs(id),
  disaster_case_id uuid REFERENCES disaster_cases(id),
  material_lot_id uuid REFERENCES material_lots(id),
  link_type text NOT NULL CHECK (link_type IN ('material', 'service', 'works', 'subsidy', 'other')),
  confidence text NOT NULL DEFAULT 'reported'
    CHECK (confidence IN ('reported', 'corroborated', 'validated')),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'under_review', 'verified', 'disputed')),
  note text,
  linked_by_actor_id uuid REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un vínculo que no apunta a ningún resultado no vincula nada.
  CHECK (
    aid_delivery_id IS NOT NULL OR supply_need_id IS NOT NULL
    OR disaster_case_id IS NOT NULL OR material_lot_id IS NOT NULL
  ),
  CHECK (contract_id IS NOT NULL OR funding_flow_id IS NOT NULL)
);

CREATE INDEX delivery_links_contract_idx ON delivery_links(contract_id);
CREATE INDEX delivery_links_case_idx ON delivery_links(disaster_case_id);
