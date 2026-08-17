-- Caché de geocodificación, y la honestidad sobre lo que una coordenada geocodificada significa.
--
-- Hay ~177 puntos entre `cuidarcolombia` y `ayudaspereira` que traen una dirección escrita y ninguna
-- coordenada, así que no se pueden pintar. Son centros de acopio en Bogotá, Medellín, Cartagena,
-- Barranquilla, Cúcuta: ciudades donde hoy el mapa no tiene nada porque nuestras fuentes con
-- coordenada son de Cali y Pereira.
--
-- **Por qué hay tabla y no una llamada al vuelo.** La política de Nominatim exige cachear los
-- resultados y limita las tareas en lote a 4 peticiones por minuto desde una sola máquina. Sin
-- caché, cada corrida de la ingesta repetiría las mismas consultas cada media hora, que es
-- exactamente el comportamiento que su política llama «faulty» y bloquea. Somos invitados en su
-- infraestructura igual que en la de mapadelterremoto.
CREATE TABLE geocoded_addresses (
  -- La consulta normalizada: es la clave real, porque dos fuentes pueden escribir la misma
  -- dirección distinto y no tiene sentido preguntar dos veces por el mismo sitio.
  query_hash text PRIMARY KEY CHECK (char_length(query_hash) = 64),
  query_text text NOT NULL,
  municipality text NOT NULL,

  -- NULL cuando el geocodificador no encontró nada, o cuando encontró algo fuera del municipio
  -- declarado. Se guarda igual: saber que una dirección **no** se pudo ubicar vale tanto como la
  -- coordenada, y evita volver a preguntarlo cada media hora.
  location geometry(Point, 4326),

  -- A qué nivel resolvió de verdad, no a qué nivel nos gustaría.
  --
  -- Nominatim, sin número de casa, devuelve el centroide de la calle: para una carrera larga eso
  -- puede quedar a kilómetros del portal. Y una misma «Carrera 15» existe en varios corregimientos
  -- del mismo municipio —«Carrera 15 #31-110, barrio El Espinal» de Cartagena resolvió en Bayunca,
  -- que es rural y está al norte—. Por eso el valor más fino que este proceso puede afirmar es
  -- `calle`, nunca `exacta`: lo exacto solo lo da quien estuvo en el sitio.
  precision text NOT NULL CHECK (precision IN ('calle', 'barrio', 'municipio', 'sin_resultado')),

  provider text NOT NULL,
  -- La respuesta cruda del proveedor, para poder auditar una ubicación dudosa sin volver a pedirla.
  provider_response jsonb,
  rejected_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX geocoded_addresses_location_idx ON geocoded_addresses USING gist(location)
  WHERE location IS NOT NULL;

-- Un punto geocodificado **no es un punto reportado**, y el mapa tiene que poder decirlo.
--
-- `public_location_precision` existía desde `014` y no lo leía nadie: se creó pensando en ocultar
-- la ubicación de un hogar, no en declarar de dónde salió una coordenada. Es el mismo campo y sirve
-- para lo mismo —decir cuánto vale este punto—, así que en vez de añadir otra columna se le añade
-- el valor que faltaba.
ALTER TABLE community_reports
  DROP CONSTRAINT IF EXISTS community_reports_public_location_precision_check;

ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_public_location_precision_check
  CHECK (public_location_precision IN ('hidden', 'zone', 'neighborhood', 'approximate', 'geocoded'));

-- La regla que hace segura toda esta pieza: **nunca se geocodifica un rescate ni un colapso.**
--
-- Un equipo que va a sacar a alguien de debajo de unos escombros necesita la esquina, no la calle.
-- Una coordenada deducida de un texto puede estar a dos kilómetros, y en ese caso el marcador no
-- ayuda: manda a alguien al sitio equivocado mientras el reloj corre. Estos dos tipos de punto solo
-- existen si alguien puso la ubicación de verdad.
ALTER TABLE community_reports
  ADD CONSTRAINT community_reports_no_geocoded_rescue_ck
  CHECK (
    public_location_precision <> 'geocoded'
    OR (report_type <> 'rescate' AND (report_type <> 'dano' OR damage_severity <> 'colapso'))
  );
