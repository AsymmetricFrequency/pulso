CREATE TABLE material_catalog_items (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9-]{3,80}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
  dimension text NOT NULL CHECK (dimension IN ('count', 'mass', 'volume', 'area', 'length')),
  canonical_unit text NOT NULL CHECK (char_length(canonical_unit) BETWEEN 1 AND 30),
  specification_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supply_needs (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  catalog_item_id uuid NOT NULL REFERENCES material_catalog_items(id),
  quantity numeric(20, 6) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL,
  canonical_quantity numeric(20, 6) NOT NULL CHECK (canonical_quantity > 0),
  priority text NOT NULL CHECK (priority IN ('routine', 'priority', 'urgent', 'immediate')),
  status text NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified', 'validated', 'partially_covered', 'covered', 'cancelled')),
  specification jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_assessment_id uuid REFERENCES rapid_assessments(id),
  validated_by_actor_id uuid REFERENCES actors(id),
  validated_at timestamptz,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'identified' AND validated_at IS NULL) OR status <> 'identified')
);

CREATE INDEX supply_needs_incident_status_idx
  ON supply_needs(incident_id, status, priority, created_at DESC);
CREATE INDEX supply_needs_zone_item_idx
  ON supply_needs(zone_id, catalog_item_id, status);

CREATE TABLE donation_commitments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  donor_organization_id uuid REFERENCES organizations(id),
  donor_actor_id uuid REFERENCES actors(id),
  donation_type text NOT NULL CHECK (donation_type IN ('money', 'in_kind')),
  status text NOT NULL DEFAULT 'pledged'
    CHECK (status IN ('pledged', 'received', 'partially_received', 'cancelled', 'rejected')),
  currency char(3),
  monetary_amount numeric(20, 2),
  catalog_item_id uuid REFERENCES material_catalog_items(id),
  canonical_quantity numeric(20, 6),
  specification jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_attribution text CHECK (public_attribution IS NULL OR char_length(public_attribution) <= 160),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, idempotency_key),
  CHECK (
    (donation_type = 'money' AND currency IS NOT NULL AND monetary_amount > 0
      AND catalog_item_id IS NULL AND canonical_quantity IS NULL)
    OR
    (donation_type = 'in_kind' AND currency IS NULL AND monetary_amount IS NULL
      AND catalog_item_id IS NOT NULL AND canonical_quantity > 0)
  )
);

CREATE INDEX donation_commitments_incident_status_idx
  ON donation_commitments(incident_id, donation_type, status, created_at DESC);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  territory_id uuid REFERENCES territories(id),
  organization_id uuid REFERENCES organizations(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 180),
  location geometry(Point, 4326),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX warehouses_incident_status_idx ON warehouses(incident_id, status);
CREATE INDEX warehouses_location_gist ON warehouses USING gist(location);

CREATE TABLE material_lots (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  commitment_id uuid REFERENCES donation_commitments(id),
  catalog_item_id uuid NOT NULL REFERENCES material_catalog_items(id),
  lot_code text NOT NULL,
  canonical_quantity_received numeric(20, 6) NOT NULL CHECK (canonical_quantity_received > 0),
  specification jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'quarantined'
    CHECK (status IN ('quarantined', 'accepted', 'partially_accepted', 'rejected', 'exhausted')),
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, lot_code)
);

CREATE TABLE quality_inspections (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  lot_id uuid NOT NULL REFERENCES material_lots(id),
  inspector_actor_id uuid NOT NULL REFERENCES actors(id),
  result text NOT NULL CHECK (result IN ('accepted', 'partially_accepted', 'rejected')),
  canonical_quantity_accepted numeric(20, 6) NOT NULL CHECK (canonical_quantity_accepted >= 0),
  canonical_quantity_rejected numeric(20, 6) NOT NULL CHECK (canonical_quantity_rejected >= 0),
  observations text CHECK (observations IS NULL OR char_length(observations) <= 2000),
  inspected_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (canonical_quantity_accepted + canonical_quantity_rejected > 0)
);

CREATE INDEX quality_inspections_lot_time_idx
  ON quality_inspections(lot_id, inspected_at DESC);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  lot_id uuid NOT NULL REFERENCES material_lots(id),
  movement_type text NOT NULL CHECK (
    movement_type IN (
      'receipt', 'acceptance', 'rejection', 'transfer', 'reservation',
      'release', 'dispatch', 'delivery', 'return', 'loss', 'adjustment'
    )
  ),
  canonical_quantity numeric(20, 6) NOT NULL CHECK (canonical_quantity > 0),
  from_warehouse_id uuid REFERENCES warehouses(id),
  to_warehouse_id uuid REFERENCES warehouses(id),
  zone_id uuid REFERENCES operational_zones(id),
  actor_id uuid NOT NULL REFERENCES actors(id),
  occurred_at timestamptz NOT NULL,
  client_mutation_id uuid NOT NULL,
  corrects_movement_id uuid REFERENCES inventory_movements(id),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 1000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id),
  CHECK (from_warehouse_id IS NULL OR to_warehouse_id IS NULL OR from_warehouse_id <> to_warehouse_id),
  CHECK (movement_type <> 'transfer' OR (from_warehouse_id IS NOT NULL AND to_warehouse_id IS NOT NULL)),
  CHECK (movement_type <> 'delivery' OR (from_warehouse_id IS NOT NULL AND zone_id IS NOT NULL)),
  CHECK (movement_type <> 'adjustment' OR (corrects_movement_id IS NOT NULL AND reason IS NOT NULL))
);

CREATE INDEX inventory_movements_lot_time_idx
  ON inventory_movements(lot_id, occurred_at, id);
CREATE INDEX inventory_movements_warehouse_time_idx
  ON inventory_movements(from_warehouse_id, to_warehouse_id, occurred_at DESC);

CREATE TABLE material_allocations (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  need_id uuid NOT NULL REFERENCES supply_needs(id),
  lot_id uuid NOT NULL REFERENCES material_lots(id),
  warehouse_id uuid NOT NULL REFERENCES warehouses(id),
  canonical_quantity numeric(20, 6) NOT NULL CHECK (canonical_quantity > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'dispatched', 'delivered', 'released', 'cancelled')),
  authorized_by_actor_id uuid NOT NULL REFERENCES actors(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX material_allocations_need_status_idx ON material_allocations(need_id, status);

CREATE TABLE aid_deliveries (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  allocation_id uuid NOT NULL REFERENCES material_allocations(id),
  zone_id uuid NOT NULL REFERENCES operational_zones(id),
  canonical_quantity_delivered numeric(20, 6) NOT NULL CHECK (canonical_quantity_delivered > 0),
  delivered_by_actor_id uuid NOT NULL REFERENCES actors(id),
  receiver_reference_hash text NOT NULL CHECK (char_length(receiver_reference_hash) = 64),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  confirmation_status text NOT NULL DEFAULT 'reported'
    CHECK (confirmation_status IN ('reported', 'recipient_confirmed', 'independently_verified', 'disputed')),
  delivered_at timestamptz NOT NULL,
  client_mutation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incident_id, client_mutation_id)
);

CREATE INDEX aid_deliveries_zone_time_idx ON aid_deliveries(zone_id, delivered_at DESC);

CREATE TABLE public_report_publications (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'published', 'corrected', 'withdrawn')),
  cutoff_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (char_length(snapshot_hash) = 64),
  privacy_reviewed_at timestamptz,
  privacy_reviewed_by_actor_id uuid REFERENCES actors(id),
  published_at timestamptz,
  published_by_actor_id uuid REFERENCES actors(id),
  supersedes_publication_id uuid REFERENCES public_report_publications(id),
  merkle_root text CHECK (merkle_root IS NULL OR char_length(merkle_root) = 64),
  solana_network text CHECK (solana_network IS NULL OR solana_network IN ('devnet', 'mainnet')),
  solana_signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status NOT IN ('published', 'corrected')
    OR (privacy_reviewed_at IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX public_report_one_published_cut_uidx
  ON public_report_publications(incident_id, cutoff_at)
  WHERE status IN ('published', 'corrected');
CREATE INDEX public_report_latest_idx
  ON public_report_publications(incident_id, published_at DESC)
  WHERE status IN ('published', 'corrected');
