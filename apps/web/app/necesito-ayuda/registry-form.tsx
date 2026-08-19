"use client";

import { useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INCIDENT = "colombia-2026";

/**
 * La versión del texto de consentimiento. Viaja con el envío y el servidor la exige: si alguien
 * cambia el texto sin subir la versión, el registro se rechaza. Un booleano «aceptó» no prueba
 * **a qué** aceptó, y eso es lo que hay que poder demostrar.
 */
const CONSENT_VERSION = 1;

/** El texto completo, palabra por palabra el que guarda `consent_texts` en la versión de arriba. */
const CONSENT_FULL =
  "Autorizo a Pulso a tratar los datos que entrego en este formulario con una única finalidad: " +
  "entregarle a la alcaldía o a la autoridad de gestión del riesgo de mi municipio la información " +
  "de que mi hogar resultó afectado y, si es el caso, que todavía no nos ha censado nadie, para " +
  "que una brigada pueda venir. Entiendo que Pulso no es una autoridad, que registrarme aquí NO me " +
  "inscribe en ninguna ayuda y NO me da derecho a recibirla, y que el censo oficial se hace de " +
  "forma presencial. Entiendo que mi nombre, mi teléfono y mi documento se guardan cifrados, que " +
  "nunca se publican, y que puedo consultar o pedir el borrado de mis datos en cualquier momento " +
  "con el código que se me entrega al terminar. Este tratamiento se hace conforme a la Ley 1581 " +
  "de 2012.";

const DWELLING = [
  { value: "destruida", label: "Se cayó o quedó destruida" },
  { value: "inhabitable", label: "En pie, pero no se puede vivir" },
  { value: "con_danos", label: "Con daños, pero se puede vivir" },
  { value: "sin_danos", label: "Sin daños" },
] as const;

const SHELTERING = [
  { value: "vivienda", label: "En nuestra casa" },
  { value: "albergue", label: "En un albergue" },
  { value: "familiares", label: "Con familiares o vecinos" },
  { value: "calle_o_carpa", label: "En la calle o en una carpa" },
] as const;

type Receipt = { publicCode: string; createdAt: string };

/**
 * Subir la foto **después** de registrar, no antes.
 *
 * Si la foto fuera parte del formulario, sería un paso más entre alguien y estar en la lista — y
 * subir una imagen desde un teléfono con poca señal es el paso que más veces falla. Así el registro
 * queda guardado primero y la foto es un extra que, si no sale, no se llevó nada por delante.
 */
function EvidenceUpload({ publicCode }: { publicCode: string }) {
  const [estado, setEstado] = useState<"inicio" | "subiendo" | "listo" | "error">("inicio");
  const [mensaje, setMensaje] = useState<string | null>(null);

  const subir = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setEstado("error");
      setMensaje("La foto pesa demasiado. Prueba con una más pequeña.");
      return;
    }
    setEstado("subiendo");
    setMensaje(null);

    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(new Error("no se pudo leer"));
        reader.readAsDataURL(file);
      });

      const response = await fetch(
        `${apiUrl}/v1/public/incidents/${INCIDENT}/household-registry/evidence`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicCode,
            fileName: file.name.slice(0, 180),
            contentType: file.type === "image/png" ? "image/png" : "image/jpeg",
            dataBase64,
          }),
        },
      );
      if (!response.ok) {
        setEstado("error");
        setMensaje("No se pudo subir. Puedes intentarlo otra vez cuando tengas mejor señal.");
        return;
      }
      setEstado("listo");
    } catch {
      setEstado("error");
      setMensaje("No se pudo subir. Puedes intentarlo otra vez cuando tengas mejor señal.");
    }
  };

  if (estado === "listo") {
    return (
      <p className="evidenceDone" role="status">
        <strong>Foto recibida.</strong> Solo la ve quien revisa, nunca se publica, y se borra con
        tus datos si usas tu código.
      </p>
    );
  }

  return (
    <div className="evidenceUpload">
      <p>
        <strong>Si puedes, añade una foto del daño.</strong> Es opcional y ayuda a que tu registro
        pese más cuando alguien lo revise.
      </p>
      {/* `capture` abre la cámara directamente en un teléfono: una foto del daño se toma ahí mismo,
          no se busca en la galería. */}
      <label className="evidenceButton">
        <input
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={subir}
          disabled={estado === "subiendo"}
        />
        <span>{estado === "subiendo" ? "Subiendo…" : "Tomar o elegir una foto"}</span>
      </label>
      <small>
        Le quitamos la ubicación y los datos del teléfono antes de guardarla. No se publica nunca.
      </small>
      {mensaje ? (
        <p className="registryError" role="alert">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dos pasos, y el segundo es opcional de verdad.
 *
 * La primera versión de esto pedía trece campos, trece opciones de radio y un párrafo de ciento
 * ocho palabras de consentimiento, todo antes de poder enviar nada. Escrito para «alguien de pie,
 * con una mano, con poca batería» y luego imposible de terminar en esas condiciones.
 *
 * **Lo que el registro necesita para cumplir su única promesa** —decirle a una alcaldía que aquí
 * hay un hogar sin censar— son tres cosas: dónde, cuántos son, y si ya fue alguien. Todo lo demás
 * sirve para priorizar, y priorizar es un lujo comparado con existir en la lista. Un formulario
 * abandonado a mitad es un hogar que no aparece.
 */
export function RegistryForm({ municipalityCode = null }: { municipalityCode?: string | null }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError(null);

    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    const count = (name: string) => {
      const parsed = Number.parseInt(String(form.get(name) ?? ""), 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    try {
      const response = await fetch(`${apiUrl}/v1/public/incidents/${INCIDENT}/household-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMutationId: crypto.randomUUID(),
          neighborhood: text("neighborhood"),
          // Viene del municipio que la persona ya escribió arriba: no se le pregunta dos veces.
          territoryCode: municipalityCode,
          peopleCount: count("peopleCount"),
          childrenCount: count("childrenCount"),
          olderAdultsCount: count("olderAdultsCount"),
          hasDisability: form.get("hasDisability") === "on",
          hasPregnancy: form.get("hasPregnancy") === "on",
          hasChronicIllness: form.get("hasChronicIllness") === "on",
          // Cuando el paso opcional no se abre, el servidor recibe lo que de verdad sabemos:
          // «no sabe». Mandar «con daños» por omisión sería inventarle una respuesta a alguien.
          dwellingStatus: form.get("dwellingStatus") ?? "no_sabe",
          shelteringAt: form.get("shelteringAt") ?? "otro",
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
        setError("No se pudo guardar. Revisa el barrio y el número de personas.");
        return;
      }
      setReceipt((await response.json()) as Receipt);
    } catch {
      setError("No hay conexión. Intenta otra vez cuando tengas señal.");
    } finally {
      setSending(false);
    }
  };

  if (receipt) {
    return (
      <div className="registryReceipt" role="status">
        <h3>Quedó registrado</h3>
        <p>Este es tu código. Guárdalo.</p>
        <strong className="registryCode">{receipt.publicCode}</strong>
        <button
          type="button"
          className="registryCopy"
          onClick={() => {
            void navigator.clipboard?.writeText(receipt.publicCode).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2_500);
            });
          }}
        >
          {copied ? "Copiado" : "Copiar el código"}
        </button>
        <p>
          Con él puedes pedir que borremos tus datos cuando quieras, sin dar explicaciones ni crear
          ninguna cuenta. No lo compartas: es la llave de tu registro.
        </p>
        <EvidenceUpload publicCode={receipt.publicCode} />

        <p className="registryReminder">
          <strong>Esto no es el censo oficial</strong> y no te inscribe en ninguna ayuda. Lo que
          hicimos fue anotar que tu hogar resultó afectado, para poder decirle a tu alcaldía dónde
          falta ir.
        </p>
      </div>
    );
  }

  return (
    <form className="registryForm" onSubmit={submit}>
      {/* Tres preguntas. Es todo lo que hace falta para que este hogar exista en la lista que se le
          entrega a una alcaldía. */}
      <div className="registryField">
        <label htmlFor="neighborhood">¿En qué barrio o vereda están?</label>
        <input
          id="neighborhood"
          name="neighborhood"
          required
          minLength={2}
          maxLength={120}
          autoComplete="address-level3"
          enterKeyHint="next"
          placeholder="Ej. Barrio San José"
        />
        <small>No pedimos la dirección exacta.</small>
      </div>

      <div className="registryField narrow">
        <label htmlFor="peopleCount">¿Cuántas personas viven ahí?</label>
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

      <fieldset className="registryGroup emphasis">
        <legend>¿Ya los censó alguna brigada o funcionario?</legend>
        {[
          { value: "no", label: "No, nadie ha venido" },
          { value: "si", label: "Sí, ya nos censaron" },
          { value: "no_sabe", label: "No estoy seguro" },
        ].map((option) => (
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

      {/* Todo lo de abajo es opcional y está cerrado. Se abre quien tenga un minuto más; quien no,
          envía con tres respuestas y queda en la lista igual. */}
      <div className="registryMore">
        <button
          type="button"
          className="registryMoreToggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span>{expanded ? "Ocultar" : "Contar un poco más"}</span>
          <small>Opcional. Ayuda a dar prioridad, pero no hace falta para registrarse.</small>
        </button>

        {expanded ? (
          <div className="registryMoreBody">
            <fieldset className="registryGroup">
              <legend>¿Dónde están durmiendo ahora?</legend>
              {SHELTERING.map((option) => (
                <label key={option.value} className="registryCheck">
                  <input type="radio" name="shelteringAt" value={option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="registryGroup">
              <legend>¿Cómo quedó la vivienda?</legend>
              {DWELLING.map((option) => (
                <label key={option.value} className="registryCheck">
                  <input type="radio" name="dwellingStatus" value={option.value} />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>

            <fieldset className="registryGroup">
              <legend>¿Hay alguien en estas situaciones?</legend>
              <small className="registryGroupHint">
                Sirve para dar prioridad en albergues. No pedimos detalles médicos.
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
                <span>Alguien con una enfermedad que necesita tratamiento</span>
              </label>
              <div className="registryCounts">
                <div className="registryField">
                  <label htmlFor="childrenCount">Menores de edad</label>
                  <input
                    id="childrenCount"
                    name="childrenCount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={40}
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
                  />
                </div>
              </div>
            </fieldset>

            <fieldset className="registryGroup">
              <legend>¿Quieres que alguien pueda llamarte?</legend>
              <small className="registryGroupHint">
                Se guardan cifrados y no se publican nunca. Puedes registrarte sin darlos.
              </small>
              <div className="registryField">
                <label htmlFor="contactName">Tu nombre</label>
                <input id="contactName" name="contactName" maxLength={120} autoComplete="name" />
              </div>
              <div className="registryField">
                <label htmlFor="contactPhone">Tu teléfono</label>
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
          </div>
        ) : null}
      </div>

      {/* Sin casilla: el propio botón es el acto de autorización.
          La Ley 1581 exige una autorización **previa, expresa e informada**. Pulsar un botón que
          dice lo que hace, bajo un aviso que dice a qué se autoriza, es un acto expreso — el mismo
          patrón de la mayoría de trámites públicos. La casilla era un toque más y un modo de fallo
          más (formulario rechazado por no marcarla) sobre alguien que acaba de perder la casa.
          Lo que **no** cambia: la fila sigue apuntando a la versión del texto que se mostró, así
          que sigue siendo demostrable a qué autorizó cada persona. */}
      <div className="registryConsent">
        <p className="registryConsentText">
          Al registrar autorizas que usemos estos datos <strong>solo</strong> para decirle a tu
          alcaldía que tu hogar resultó afectado. <strong>No te inscribe en ninguna ayuda.</strong>{" "}
          Puedes pedir que se borren cuando quieras con el código que recibirás.
        </p>
        <details>
          <summary>Leer el texto completo</summary>
          <p>{CONSENT_FULL}</p>
          <p className="registryLaw">Ley 1581 de 2012 · versión {CONSENT_VERSION} del texto</p>
        </details>
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
