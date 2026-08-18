"use client";

import { useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

/**
 * La versión del texto de consentimiento que se muestra aquí abajo.
 *
 * Viaja con el envío y el servidor la exige: si alguien cambia el texto sin subir la versión, el
 * registro se rechaza. Un booleano «aceptó» no prueba **a qué** aceptó, y eso es justo lo que hay
 * que poder demostrar.
 */
const CONSENT_VERSION = 1;

const DWELLING = [
  { value: "destruida", label: "Se cayó o quedó destruida" },
  { value: "inhabitable", label: "Sigue en pie pero no se puede vivir en ella" },
  { value: "con_danos", label: "Tiene daños pero se puede vivir" },
  { value: "sin_danos", label: "No tiene daños" },
  { value: "no_sabe", label: "No sé" },
] as const;

const SHELTERING = [
  { value: "vivienda", label: "En nuestra casa" },
  { value: "albergue", label: "En un albergue" },
  { value: "familiares", label: "Con familiares o vecinos" },
  { value: "calle_o_carpa", label: "En la calle o en una carpa" },
  { value: "otro", label: "En otro sitio" },
] as const;

const CENSUSED = [
  { value: "no", label: "No, nadie ha venido" },
  { value: "si", label: "Sí, ya nos censaron" },
  { value: "no_sabe", label: "No estoy seguro" },
] as const;

type Receipt = { publicCode: string; createdAt: string };

export function RegistryForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);

    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const count = (name: string) => Number.parseInt(String(form.get(name) ?? "0"), 10) || 0;

    try {
      const response = await fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/household-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMutationId: crypto.randomUUID(),
          neighborhood: text("neighborhood"),
          peopleCount: count("peopleCount"),
          childrenCount: count("childrenCount"),
          olderAdultsCount: count("olderAdultsCount"),
          hasDisability: form.get("hasDisability") === "on",
          hasPregnancy: form.get("hasPregnancy") === "on",
          hasChronicIllness: form.get("hasChronicIllness") === "on",
          dwellingStatus: form.get("dwellingStatus"),
          shelteringAt: form.get("shelteringAt"),
          officiallyCensused: form.get("officiallyCensused"),
          contactName: text("contactName"),
          contactPhone: text("contactPhone"),
          consentVersion: CONSENT_VERSION,
          consentAccepted: true,
        }),
      });

      if (response.status === 429) {
        setError(
          "Ya se registraron varios hogares desde esta conexión en la última hora. Espera un rato e intenta de nuevo.",
        );
        return;
      }
      if (!response.ok) {
        setError(
          "No se pudo guardar. Revisa que el barrio y el número de personas estén completos.",
        );
        return;
      }
      setReceipt((await response.json()) as Receipt);
    } catch {
      setError("No hay conexión. Intenta otra vez cuando tengas señal.");
    } finally {
      setSending(false);
    }
  };

  // El recibo reemplaza el formulario entero. El código es lo único que la persona se lleva y tiene
  // que ser lo único que vea: si quedara debajo de un formulario largo, se pierde.
  if (receipt) {
    return (
      <div className="registryReceipt" role="status">
        <h3>Quedó registrado</h3>
        <p>Este es tu código. Anótalo o hazle una foto ahora.</p>
        <strong className="registryCode">{receipt.publicCode}</strong>
        <p>
          Con él puedes pedir que borremos tus datos cuando quieras, sin dar explicaciones y sin
          crear ninguna cuenta. No lo compartas: es la llave de tu registro.
        </p>
        <p className="registryReminder">
          <strong>Recuerda que esto no es el censo oficial</strong> y no te inscribe en ninguna
          ayuda. Lo que hicimos fue anotar que tu hogar resultó afectado, para poder decirle a tu
          alcaldía dónde falta ir.
        </p>
      </div>
    );
  }

  return (
    <form className="registryForm" onSubmit={submit}>
      <div className="registryField">
        <label htmlFor="neighborhood">Barrio o vereda</label>
        <input
          id="neighborhood"
          name="neighborhood"
          required
          minLength={2}
          maxLength={120}
          autoComplete="address-level3"
          placeholder="Ej. Barrio San José, vereda La Esperanza"
        />
        {/* Se dice aquí y no en la política de privacidad: la dirección exacta no se pide, y saberlo
            antes de escribir es lo que hace que alguien se atreva a escribir. */}
        <small>No pedimos la dirección exacta. Con el barrio o la vereda es suficiente.</small>
      </div>

      <fieldset className="registryGroup">
        <legend>¿Cuántas personas viven en el hogar?</legend>
        <div className="registryCounts">
          <div className="registryField">
            <label htmlFor="peopleCount">En total</label>
            <input
              id="peopleCount"
              name="peopleCount"
              type="number"
              inputMode="numeric"
              min={1}
              max={40}
              required
              defaultValue={1}
            />
          </div>
          <div className="registryField">
            <label htmlFor="childrenCount">Menores de edad</label>
            <input
              id="childrenCount"
              name="childrenCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              defaultValue={0}
            />
          </div>
          <div className="registryField">
            <label htmlFor="olderAdultsCount">Mayores de 60</label>
            <input
              id="olderAdultsCount"
              name="olderAdultsCount"
              type="number"
              inputMode="numeric"
              min={0}
              max={40}
              defaultValue={0}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="registryGroup">
        <legend>¿Hay alguien en el hogar con alguna de estas situaciones?</legend>
        {/* Booleanos y no diagnósticos. «Hay alguien con discapacidad» decide si esa familia
            necesita un sitio en planta baja; el detalle médico no es asunto nuestro. */}
        <small className="registryGroupHint">
          Marca solo lo que aplique. Sirve para dar prioridad en albergues, no pedimos detalles.
        </small>
        <label className="registryCheck">
          <input type="checkbox" name="hasDisability" />
          <span>Alguien con discapacidad</span>
        </label>
        <label className="registryCheck">
          <input type="checkbox" name="hasPregnancy" />
          <span>Alguien en embarazo</span>
        </label>
        <label className="registryCheck">
          <input type="checkbox" name="hasChronicIllness" />
          <span>Alguien con enfermedad que necesita tratamiento</span>
        </label>
      </fieldset>

      <fieldset className="registryGroup">
        <legend>¿Cómo quedó la vivienda?</legend>
        {DWELLING.map((option) => (
          <label key={option.value} className="registryCheck">
            <input
              type="radio"
              name="dwellingStatus"
              value={option.value}
              required
              defaultChecked={option.value === "con_danos"}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="registryGroup">
        <legend>¿Dónde están durmiendo ahora?</legend>
        {SHELTERING.map((option) => (
          <label key={option.value} className="registryCheck">
            <input
              type="radio"
              name="shelteringAt"
              value={option.value}
              required
              defaultChecked={option.value === "vivienda"}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="registryGroup emphasis">
        <legend>¿Ya los censó alguna brigada o funcionario?</legend>
        <small className="registryGroupHint">
          Es la pregunta más importante del formulario: con las respuestas «no» armamos la lista que
          se le entrega a tu alcaldía.
        </small>
        {CENSUSED.map((option) => (
          <label key={option.value} className="registryCheck">
            <input
              type="radio"
              name="officiallyCensused"
              value={option.value}
              required
              defaultChecked={option.value === "no"}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="registryGroup">
        <legend>Contacto (opcional)</legend>
        <small className="registryGroupHint">
          Solo si quieres que alguien pueda llamarte. Se guardan cifrados, no se publican nunca, y
          puedes registrarte sin darlos.
        </small>
        <div className="registryField">
          <label htmlFor="contactName">Nombre de quien reporta</label>
          <input id="contactName" name="contactName" maxLength={120} autoComplete="name" />
        </div>
        <div className="registryField">
          <label htmlFor="contactPhone">Teléfono</label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
          />
        </div>
      </fieldset>

      <div className="registryConsent">
        <label className="registryCheck">
          <input type="checkbox" name="consent" required />
          <span>
            Autorizo el tratamiento de estos datos <strong>con una sola finalidad</strong>:
            entregarle a la alcaldía o a la autoridad de gestión del riesgo de mi municipio que mi
            hogar resultó afectado y, si es el caso, que todavía no nos ha censado nadie, para que
            una brigada pueda venir. Entiendo que <strong>Pulso no es una autoridad</strong>, que
            registrarme aquí <strong>no me inscribe en ninguna ayuda</strong> ni me da derecho a
            recibirla, y que el censo oficial se hace de forma presencial. Mi nombre, teléfono y
            documento se guardan cifrados, no se publican, y puedo pedir que se borren en cualquier
            momento con el código que recibiré. Ley 1581 de 2012.
          </span>
        </label>
      </div>

      {error ? (
        <p className="registryError" role="alert">
          {error}
        </p>
      ) : null}

      <button type="submit" className="psNavCta helpPrimary" disabled={sending}>
        {sending ? "Guardando…" : "Registrar mi hogar"}
      </button>
    </form>
  );
}
