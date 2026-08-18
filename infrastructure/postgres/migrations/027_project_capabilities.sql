-- Inventario de lo que Pulso hace y de lo que todavía no.
--
-- El backlog (`project_tasks`) dice qué hay que construir. Eso no es lo mismo que saber **qué falta**:
-- un backlog de veinte tickets no dice si la prioridad P1 está a medio camino o sin empezar, ni
-- distingue lo que existe a medias de lo que no existe. Sin esa distinción, «cero contratos
-- confirmados» y «cero contratos ingeridos» se leen igual, que es justo lo que la invariante 3 del
-- proyecto prohíbe.
--
-- Cada fila es una capacidad concreta, con su prioridad y su estado real. `parcial` es un estado de
-- primera clase y el más informativo de los tres: casi todo lo que duele en este proyecto está
-- construido a medias, no sin empezar.
CREATE TABLE project_capabilities (
  id uuid PRIMARY KEY,
  priority text NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3', 'PL')),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('listo', 'parcial', 'falta')),
  -- Qué falta exactamente, o qué limitación tiene lo que ya existe. Sin esto, `parcial` no informa
  -- más que `falta`.
  note text,
  -- Ticket del backlog que lo cierra, si existe. Por código y no por id: es lo que la gente conoce.
  task_code text,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (priority, name)
);

CREATE INDEX project_capabilities_board_idx ON project_capabilities(priority, sort_order);
