"use client";

type LastMile = {
  relevance: "confirmed" | "probable" | "unrelated" | "unreviewed";
  contractsWithFlow: number;
  trackedAmount: number;
  contractsWithAnyDelivery: number;
  contractsConfirmedAtADoor: number;
  confirmedAmount: number;
  contractsDeniedAtADoor: number;
  deniedAmount: number;
  householdsReached: number;
};

const money = (value: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);

const count = (value: number) => value.toLocaleString("es-CO");

/**
 * Hasta dónde se puede comprobar el dinero.
 *
 * Las cifras de arriba en esta página dicen cuánto se contrató. Esta dice algo distinto y más
 * difícil: **cuánto de eso llega a una puerta y alguien que vive ahí lo confirma**. Es la única
 * medida de la página que no la produce quien ejecuta.
 *
 * Se muestra `confirmed` y `probable` por separado y nunca sumados. Lo confirmado lo revisó una
 * persona; lo probable lo marcó un clasificador leyendo el objeto contractual. Presentarlos como
 * una sola cifra convertiría una suposición de máquina en un hecho revisado.
 *
 * `unreviewed` no aparece aquí a propósito — sale en el donut de arriba como lo que es, una cola
 * de revisión. Rastrear su «última milla» daría a entender que ya se sabe que es gasto de
 * emergencia.
 */
export function LastMile({ rows, currency }: { rows: LastMile[]; currency: string }) {
  const shown = rows
    .filter((row) => row.relevance === "confirmed" || row.relevance === "probable")
    .filter((row) => row.contractsWithFlow > 0);

  if (shown.length === 0) return null;

  return (
    <section className="lastMile" aria-labelledby="last-mile-title">
      <h2 id="last-mile-title">De la plata rastreada, ¿cuánta llega a una puerta?</h2>
      <p className="lastMileLede">
        Todo lo demás en esta página lo dice quien contrata o quien ejecuta. Esta cifra solo sube
        cuando una familia, con su código y por su cuenta, dice que le llegó algo. Es la única de la
        página que no puede subir sola.
      </p>

      {shown.map((row) => {
        const steps = [
          {
            key: "rastreado",
            label: "Rastreado en contratos",
            value: count(row.contractsWithFlow),
            unit: row.contractsWithFlow === 1 ? "contrato" : "contratos",
            aside: money(row.trackedAmount, currency),
          },
          {
            key: "entrega",
            label: "Con alguna entrega anotada",
            value: count(row.contractsWithAnyDelivery),
            unit: row.contractsWithAnyDelivery === 1 ? "contrato" : "contratos",
            aside: `${count(row.householdsReached)} hogares alcanzados`,
          },
          {
            key: "confirmado",
            label: "Confirmado por un hogar",
            value: count(row.contractsConfirmedAtADoor),
            unit: row.contractsConfirmedAtADoor === 1 ? "contrato" : "contratos",
            aside: money(row.confirmedAmount, currency),
          },
        ];

        return (
          <div key={row.relevance} className="lastMileBlock">
            <p className="lastMileWho">
              {row.relevance === "confirmed" ? (
                <>
                  <strong>Contratos de la emergencia</strong> — una persona los revisó y los
                  confirmó.
                </>
              ) : (
                <>
                  <strong>Candidatos</strong> — un clasificador los marcó leyendo el objeto
                  contractual. <em>Nadie los ha revisado todavía.</em>
                </>
              )}
            </p>

            <ol className="lastMileSteps">
              {steps.map((step, index) => (
                <li
                  key={step.key}
                  className={`lastMileStep ${step.value === "0" ? "empty" : "filled"}`}
                >
                  {/* La numeración no es decorativa: son peldaños en orden, y el que sigue solo
                      puede ser menor o igual que el anterior. */}
                  <span className="lastMileRung">{index + 1}</span>
                  <span className="lastMileLabel">{step.label}</span>
                  <span className="lastMileValue">
                    {step.value} <small>{step.unit}</small>
                  </span>
                  <span className="lastMileAside">{step.aside}</span>
                </li>
              ))}
            </ol>

            {/* El desmentido va fuera de la escalera y no se resta de nada: no es una corrección
                contable, es una denuncia sin resolver. */}
            {row.contractsDeniedAtADoor > 0 ? (
              <p className="lastMileDenied">
                <strong>
                  {count(row.contractsDeniedAtADoor)}{" "}
                  {row.contractsDeniedAtADoor === 1 ? "contrato tiene" : "contratos tienen"} una
                  entrega que el hogar dice que nunca llegó.
                </strong>{" "}
                No se resta de las cifras de arriba: está sin resolver, y restarlo daría por cierto
                un desmentido que nadie ha revisado.
              </p>
            ) : null}

            {row.contractsConfirmedAtADoor === 0 ? (
              // Cero aquí es el estado real y se explica, no se disimula ni se dramatiza.
              <p className="lastMileZero">
                Ningún peso rastreado llega todavía a una puerta que lo confirme. El registro de
                entregas a hogares acaba de abrirse y aún no hay ninguna anotada — no es que se haya
                comprobado que no llegó, es que no hay nada que comprobar.
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
