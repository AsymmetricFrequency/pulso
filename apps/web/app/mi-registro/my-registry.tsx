"use client";

import { useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

type Delivery = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  deliveredBy: string;
  fundingSource: string | null;
  confirmation: "declarada" | "confirmada" | "verificada" | "rechazada";
  householdNote: string | null;
  deliveredAt: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(new Date(value));

/**
 * Lo que un hogar ve con su código, y donde puede **desmentir** una entrega.
 *
 * Esta pantalla es la que convierte el registro en algo auditable. Sin ella, «se entregaron 400
 * kits» es lo que dice quien los entregó y nada más. Con ella, la persona que debía recibirlos
 * puede decir que no llegaron — y esa es la única señal del sistema que no puede venir de alguien
 * con interés en que la cifra suba.
 *
 * Sin cuenta y sin contraseña: el código es la credencial. Pedir una cuenta para desmentir una
 * entrega registrada a tu nombre sería ponerle un peaje al control.
 */
export function MyRegistry() {
  const [code, setCode] = useState("");
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const consult = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (code.trim().length < 6) return;
    setLoading(true);
    setNotFound(false);
    try {
      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${INCIDENT}/household-registry/${encodeURIComponent(code.trim())}/deliveries`,
      );
      if (!response.ok) {
        setNotFound(true);
        setDeliveries(null);
        return;
      }
      setDeliveries((await response.json()) as Delivery[]);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const answer = async (delivery: Delivery, received: boolean) => {
    setAnswering(delivery.id);
    try {
      await fetch(
        `${apiUrl}/v1/public/incidents/${INCIDENT}/household-registry/${encodeURIComponent(code.trim())}/deliveries/${delivery.id}/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ received, note: null }),
        },
      );
      setDeliveries(
        (current) =>
          current?.map((item) =>
            item.id === delivery.id
              ? { ...item, confirmation: received ? "confirmada" : "rechazada" }
              : item,
          ) ?? null,
      );
    } finally {
      setAnswering(null);
    }
  };

  return (
    <>
      <section className="helpHero">
        <h1>Qué han registrado a tu nombre</h1>
        <p className="helpLede">
          Escribe el código que te dimos al registrarte. Verás qué ayuda dice alguien que te
          entregó, y puedes confirmarla o decir que no te llegó. Sin cuenta y sin contraseña.
        </p>
      </section>

      <section className="helpStep">
        <form className="whereForm" onSubmit={consult}>
          <label htmlFor="code" className="srOnly">
            Tu código
          </label>
          <input
            id="code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            autoComplete="off"
            autoCapitalize="characters"
            enterKeyHint="search"
            className="codeInput"
          />
          <button type="submit" className="psNavCta helpPrimary" disabled={loading}>
            {loading ? "Buscando…" : "Consultar"}
          </button>
        </form>

        {notFound ? (
          <p className="helpError" role="status">
            No encontramos ese código. Revisa que esté completo, con el guion en el medio.
          </p>
        ) : null}

        {/* Cero entregas no es una mala noticia y no se dibuja como tal: se explica qué significa y
            qué hacer, que es pedirle a quien entregó que lo registre. */}
        {deliveries !== null && deliveries.length === 0 ? (
          <div className="helpWarning subtle">
            <p>
              <strong>Todavía nadie ha registrado una entrega a tu nombre.</strong> Eso no significa
              que no vayas a recibir ayuda: significa que aquí no hay nada anotado. Si alguien te
              entregó algo y no aparece, pídele que lo registre con tu código — es lo que permite
              que se pueda comprobar después.
            </p>
          </div>
        ) : null}

        {deliveries && deliveries.length > 0 ? (
          <ul className="deliveryList">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className={`deliveryItem ${delivery.confirmation}`}>
                <div>
                  <strong>
                    {delivery.quantity ? `${delivery.quantity} ` : ""}
                    {delivery.unit ? `${delivery.unit} · ` : ""}
                    {delivery.description}
                  </strong>
                  <small>
                    {delivery.deliveredBy} · {formatDate(delivery.deliveredAt)}
                    {delivery.fundingSource ? ` · ${delivery.fundingSource}` : ""}
                  </small>
                </div>

                {delivery.confirmation === "declarada" ? (
                  <div className="deliveryAnswer">
                    <p>¿Recibiste esto?</p>
                    <div className="deliveryButtons">
                      <button
                        type="button"
                        className="deliveryYes"
                        disabled={answering === delivery.id}
                        onClick={() => void answer(delivery, true)}
                      >
                        Sí, lo recibí
                      </button>
                      {/* El botón que hace que esto sea auditoría. **Del mismo tamaño que el otro**:
                          hacerlo más pequeño o más pálido inclinaría la respuesta, y una respuesta
                          inclinada no sirve para auditar nada. */}
                      <button
                        type="button"
                        className="deliveryNo"
                        disabled={answering === delivery.id}
                        onClick={() => void answer(delivery, false)}
                      >
                        No me llegó
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="deliveryState">
                    {delivery.confirmation === "confirmada"
                      ? "Confirmaste que lo recibiste."
                      : delivery.confirmation === "rechazada"
                        ? "Dijiste que esto no te llegó. Queda registrado."
                        : "Verificado por un tercero."}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="helpStep">
        <p className="helpStepNum">Tus datos</p>
        <h2>Borrarlos, cuando quieras</h2>
        <p>
          Con ese mismo código puedes pedir que borremos tu nombre, tu teléfono y tus fotos. Escribe
          a <a href="mailto:vortexlabcol@gmail.com">vortexlabcol@gmail.com</a> con el código y ya
          está — no hay que dar explicaciones. Si no lo pides, se borran solos a los 90 días.
        </p>
        <p className="helpAside">
          Se conserva únicamente el conteo agregado de tu municipio, que ya no te identifica: esa
          cifra no puede bajar porque alguien ejerció un derecho.{" "}
          <a href="/privacidad">Cómo tratamos tus datos</a>.
        </p>
      </section>
    </>
  );
}
