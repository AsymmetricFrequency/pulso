"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type Controller = {
  version: number;
  legalName: string;
  taxId: string | null;
  legalForm: string;
  address: string | null;
  city: string | null;
  country: string;
  email: string;
  phone: string | null;
  privacyContact: string;
  legallyConstituted: boolean;
};

const FORM_LABEL: Record<string, string> = {
  proyecto_voluntario: "Proyecto voluntario, sin figura jurídica todavía",
  fundacion: "Fundación",
  corporacion: "Corporación",
  entidad_publica: "Entidad pública",
  otra: "Otra",
};

/**
 * Quién responde por los datos, leído de la API.
 *
 * No está escrito en esta página a propósito: los datos se van a canalizar por una fundación
 * constituida, y ese día tiene que ser **una fila nueva**, no un despliegue de la web y una búsqueda
 * a mano en tres archivos.
 */
export function DataController() {
  const [controller, setController] = useState<Controller | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/v1/public/data-controller`)
      .then((response) => (response.ok ? (response.json() as Promise<Controller>) : null))
      .then(setController)
      .catch(() => setController(null));
  }, []);

  return (
    <section className="legalSection">
      <h2>1. Quién responde por estos datos</h2>

      {controller ? (
        <>
          <p>
            <strong>{controller.legalName}</strong>
          </p>
          <ul>
            <li>Naturaleza: {FORM_LABEL[controller.legalForm] ?? controller.legalForm}</li>
            {controller.taxId ? <li>NIT: {controller.taxId}</li> : null}
            {controller.address ? (
              <li>
                Dirección: {controller.address}
                {controller.city ? `, ${controller.city}` : ""} · {controller.country}
              </li>
            ) : null}
            <li>
              Correo para todo lo relacionado con datos personales:{" "}
              <a href={`mailto:${controller.email}`}>{controller.email}</a>
            </li>
            {controller.phone ? <li>Teléfono: {controller.phone}</li> : null}
            <li>Responsable de atender tus peticiones: {controller.privacyContact}</li>
            <li>
              Código fuente auditable:{" "}
              <a
                href="https://github.com/AsymmetricFrequency/pulso"
                target="_blank"
                rel="noreferrer noopener"
              >
                github.com/AsymmetricFrequency/pulso
              </a>
            </li>
          </ul>

          {/* Se dice, no se disimula. Una política que aparenta una figura jurídica que no existe
              engaña a quien confía en ella; ésta solo le dice dónde está parado. */}
          {!controller.legallyConstituted ? (
            <p className="legalWarning">
              <strong>
                Todavía no hay una figura jurídica constituida detrás de este proyecto.
              </strong>{" "}
              Pulso lo desarrolla un equipo de voluntarios y está en trámite canalizar la
              responsabilidad por estos datos a través de una fundación. Mientras eso ocurre, quien
              responde es el equipo del proyecto en la dirección de arriba, y te lo decimos de
              frente en vez de dar por hecho algo que no existe. Cuando la fundación asuma, te lo
              informaremos: la ley obliga a avisar de un cambio así, y guardamos con qué versión de
              este texto se registró cada quien precisamente para poder hacerlo.
            </p>
          ) : null}
        </>
      ) : (
        <p>Cargando los datos del responsable…</p>
      )}

      <p className="legalNote">
        <strong>Pulso no es una autoridad.</strong> No decidimos quién recibe ayuda y registrarse
        aquí no inscribe a nadie en ningún programa. El censo oficial lo hacen las autoridades.
      </p>
    </section>
  );
}
