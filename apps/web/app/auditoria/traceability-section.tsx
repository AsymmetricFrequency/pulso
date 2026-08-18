"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type ChainLink = {
  key: string;
  label: string;
  count: number;
  backed: number;
  backedLabel: string;
};

type Traceability = {
  chain: ChainLink[];
  deliveryConfirmation: {
    reported: number;
    recipientConfirmed: number;
    independentlyVerified: number;
    disputed: number;
  };
  integrity: {
    published: number;
    firstCutoffAt: string | null;
    lastCutoffAt: string | null;
    chained: number;
    externallyAnchored: number;
  };
  contracts: {
    total: number;
    reviewed: number;
    contractedAmount: number;
    paidAmount: number;
    linkedToDelivery: number;
  };
  generatedAt: string;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        day: "numeric",
        month: "long",
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "—";

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
    notation: value >= 1_000_000_000 ? "compact" : "standard",
  }).format(value);

export function TraceabilitySection() {
  const [data, setData] = useState<Traceability | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/aid-traceability`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("traceability unavailable");
        return response.json() as Promise<Traceability>;
      })
      .then(setData)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) setData(null);
      });
    return () => controller.abort();
  }, []);

  if (data === null) return null;

  const { chain, integrity, contracts } = data;
  const deliveries = chain.find((link) => link.key === "entrega")?.count ?? 0;

  return (
    <section className="traceSection" id="trazabilidad" aria-labelledby="trace-title">
      <div className="sectionHeading">
        <div>
          <p className="psEyebrow">Trazabilidad de la ayuda</p>
          <h2 id="trace-title">De la necesidad a la entrega</h2>
        </div>
        <span className="sectionNote">Corte: {formatDate(data.generatedAt)}</span>
      </div>

      <p className="shakingCaveat">
        Una promesa no es un despacho y un despacho no es una entrega. La cadena se cuenta eslabón
        por eslabón para que ninguno herede el mérito del anterior.
      </p>

      <ol className="traceChain">
        {chain.map((link) => (
          <li key={link.key} className={link.count === 0 ? "empty" : undefined}>
            <strong>{link.count.toLocaleString("es-CO")}</strong>
            <span>{link.label}</span>
            <small>
              {link.count === 0
                ? "sin registros"
                : `${link.backed.toLocaleString("es-CO")} ${link.backedLabel}`}
            </small>
          </li>
        ))}
      </ol>

      {/* La frase más importante de la página. Sin ella, un cero se lee como «no llegó ayuda», que
          es falso y grave: la ayuda está llegando por canales que no pasan por aquí. */}
      {deliveries === 0 ? (
        <p className="traceZeroNote">
          <strong>Cero entregas registradas no significa cero entregas.</strong> Significa que
          ninguna ha quedado registrada en Pulso: hoy no hay zonas operativas ni equipos dados de
          alta, así que la cadena está vacía de origen. La ayuda que están entregando la UNGRD, las
          alcaldías y los organismos de socorro no pasa por este registro, y esta página no puede
          hablar de ella. Es la diferencia que un ente de control tiene que poder ver, y por eso el
          cero se muestra en vez de esconderse.
        </p>
      ) : null}

      <div className="traceGrid">
        <article>
          <h3>Dinero público</h3>
          <dl>
            <div>
              <dt>Contratos rastreados</dt>
              <dd>{contracts.total.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt>Revisados por relevancia</dt>
              <dd>{contracts.reviewed.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt>Contratado (emergencia)</dt>
              <dd>{formatMoney(contracts.contractedAmount)}</dd>
            </div>
            <div>
              <dt>Pagado</dt>
              <dd>{formatMoney(contracts.paidAmount)}</dd>
            </div>
            <div>
              <dt>Con entrega verificada en territorio</dt>
              <dd className={contracts.linkedToDelivery === 0 ? "zero" : undefined}>
                {contracts.linkedToDelivery.toLocaleString("es-CO")}
              </dd>
            </div>
          </dl>
          {/* Es el eslabón que casi nunca existe en ningún sistema, y el que de verdad importa:
              un contrato pagado sin entrega verificada es una cifra, no una ayuda. */}
          <p>
            El último renglón es el que cierra el círculo: un contrato pagado sin entrega verificada
            en territorio es una cifra, no una ayuda que llegó.
          </p>
        </article>

        <article>
          <h3>Integridad de lo publicado</h3>
          <dl>
            <div>
              <dt>Cortes publicados</dt>
              <dd>{integrity.published.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt>Desde</dt>
              <dd>{formatDate(integrity.firstCutoffAt)}</dd>
            </div>
            <div>
              <dt>Último corte</dt>
              <dd>{formatDate(integrity.lastCutoffAt)}</dd>
            </div>
            <div>
              <dt>Encadenados al corte anterior</dt>
              <dd>{integrity.chained.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt>Anclados fuera de Pulso</dt>
              <dd className={integrity.externallyAnchored === 0 ? "zero" : undefined}>
                {integrity.externallyAnchored.toLocaleString("es-CO")}
              </dd>
            </div>
          </dl>
          {/* Va aquí y no en una nota al pie, y dice lo que dicen los números en vez de lo que nos
              gustaría que dijeran. Vender una verificación independiente que no existe es peor que
              no ofrecer ninguna: quien audita dejaría de mirar creyendo que ya está mirado. */}
          <p>
            Cada corte guarda el hash de lo que publicó, así que se puede comprobar que <em>ese</em>{" "}
            corte no cambió después.{" "}
            {integrity.chained === 0
              ? "Los cortes anteriores al 18 de agosto no están enlazados entre sí, así que la serie no se puede verificar completa: un corte que faltara no dejaría hueco. Desde hoy cada corte nuevo apunta al anterior, y este contador sube con ellos."
              : `${integrity.chained.toLocaleString("es-CO")} están enlazados al corte anterior, así que esa parte de la serie se verifica completa y no solo corte por corte.`}{" "}
            {integrity.externallyAnchored === 0 ? (
              <>
                Y mientras «anclados fuera de Pulso» siga en cero,{" "}
                <strong>toda la comprobación se hace contra nosotros mismos</strong> — todavía no es
                verificación independiente.
              </>
            ) : null}
          </p>
        </article>
      </div>
    </section>
  );
}
