"use client";

import { useState } from "react";
import styles from "./operations.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Estado = "inicio" | "guardando" | "listo" | "sin_permiso" | "sin_hogar" | "error";

/**
 * Registrar que a un hogar le llegó algo.
 *
 * Se llena al lado de la puerta, con el teléfono en una mano y la caja en la otra, así que pide lo
 * mínimo: el código del hogar, qué se entregó y quién lo entregó. La fecha se pone sola en «ahora»
 * porque el caso normal es registrarlo en el momento.
 *
 * **Queda como `declarada`, que es lo que de verdad es**: lo dice quien entregó. Sube a `confirmada`
 * solo cuando el hogar lo diga con su código, y ahí es cuando vale como comprobación.
 */
export function RecordDelivery({
  incidentId,
  sessionToken,
}: {
  incidentId: string;
  sessionToken: string;
}) {
  const [estado, setEstado] = useState<Estado>("inicio");
  const [open, setOpen] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setEstado("guardando");

    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const quantity = Number.parseFloat(String(form.get("quantity") ?? ""));

    try {
      const response = await fetch(
        `${apiUrl}/v1/operations/incidents/${incidentId}/household-deliveries`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            publicCode: text("publicCode"),
            description: text("description"),
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
            unit: text("unit"),
            deliveredBy: text("deliveredBy"),
            fundingSource: text("fundingSource"),
            deliveredAt: new Date().toISOString(),
          }),
        },
      );

      // 409 es el trigger de finalidad, y merece su propio mensaje: no es un fallo de quien está
      // registrando, es que ese hogar no autorizó ser contactado para recibir ayuda.
      if (response.status === 409) {
        setEstado("sin_permiso");
        return;
      }
      if (response.status === 404) {
        setEstado("sin_hogar");
        return;
      }
      if (!response.ok) {
        setEstado("error");
        return;
      }
      setEstado("listo");
      (event.target as HTMLFormElement).reset();
    } catch {
      setEstado("error");
    }
  };

  if (!open) {
    return (
      <section className={styles.queueSection} aria-labelledby="delivery-title">
        <div className={styles.queueHeading}>
          <h2 id="delivery-title">Registrar una entrega</h2>
        </div>
        <p className={styles.queueNote}>
          Anota qué le llegó a un hogar y de dónde salió. Queda como <strong>declarada</strong>{" "}
          hasta que la familia lo confirme con su código — que es lo que la convierte en una
          comprobación y no en nuestra palabra.
        </p>
        <button type="button" className={styles.queueOpen} onClick={() => setOpen(true)}>
          Registrar una entrega
        </button>
      </section>
    );
  }

  return (
    <section className={styles.queueSection} aria-labelledby="delivery-title">
      <div className={styles.queueHeading}>
        <h2 id="delivery-title">Registrar una entrega</h2>
      </div>

      <form className={styles.deliveryForm} onSubmit={submit}>
        <label>
          <span>Código del hogar</span>
          <input
            name="publicCode"
            required
            minLength={6}
            maxLength={20}
            placeholder="ABCD-1234"
            autoCapitalize="characters"
            className={styles.deliveryCode}
          />
        </label>

        <label className={styles.deliveryWide}>
          <span>Qué se entregó</span>
          <input
            name="description"
            required
            minLength={3}
            maxLength={300}
            placeholder="Ej. Kit de alimentos, tejas de zinc, colchonetas"
          />
        </label>

        <label>
          <span>Cantidad</span>
          <input name="quantity" type="number" inputMode="decimal" min="0" step="any" />
        </label>

        <label>
          <span>Unidad</span>
          <input name="unit" maxLength={30} placeholder="kit, bulto, unidad" />
        </label>

        <label className={styles.deliveryWide}>
          <span>Quién entregó</span>
          {/* Una organización con nombre, no «un voluntario»: si nadie responde por una entrega, no
              se puede auditar. */}
          <input
            name="deliveredBy"
            required
            minLength={3}
            maxLength={200}
            placeholder="Nombre de la organización"
          />
        </label>

        <label className={styles.deliveryWide}>
          <span>De dónde salió el recurso</span>
          <input
            name="fundingSource"
            maxLength={200}
            placeholder="Donación, contrato, recursos propios… (opcional)"
          />
        </label>

        {estado === "sin_permiso" ? (
          <p className={styles.deliveryBlocked}>
            <strong>Ese hogar no autorizó ser contactado para recibir ayuda.</strong> No se puede
            registrar una entrega a su nombre: usaría sus datos para algo que no consintió. Si la
            ayuda ya se entregó, pídele que autorice esa finalidad en{" "}
            <code>pulso.my/necesito-ayuda</code> y vuelve a registrarla.
          </p>
        ) : null}
        {estado === "sin_hogar" ? (
          <p className={styles.queueError}>No encontramos ese código de hogar.</p>
        ) : null}
        {estado === "error" ? (
          <p className={styles.queueError}>
            No se pudo guardar. Revisa los campos e intenta otra vez.
          </p>
        ) : null}
        {estado === "listo" ? (
          <p className={styles.deliveryDone} role="status">
            <strong>Entrega registrada.</strong> Queda como declarada hasta que la familia la
            confirme con su código en <code>pulso.my/mi-registro</code>.
          </p>
        ) : null}

        <div className={styles.queueActions}>
          <button type="submit" disabled={estado === "guardando"}>
            {estado === "guardando" ? "Guardando…" : "Registrar"}
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
      </form>
    </section>
  );
}
