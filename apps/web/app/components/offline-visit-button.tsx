"use client";

import { useEffect, useState } from "react";
import { countQueuedVisits, queueFieldVisit } from "../lib/offline-visit-queue";

export function OfflineVisitButton() {
  const [pending, setPending] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    countQueuedVisits()
      .then(setPending)
      .catch(() => setMessage("Almacenamiento no disponible"));
  }, []);

  const prepareVisit = async () => {
    try {
      await queueFieldVisit("Zona SJDP-01");
      setPending(await countQueuedVisits());
      setMessage(navigator.onLine ? "Guardada y lista para sincronizar" : "Guardada sin conexión");
    } catch {
      setMessage("No fue posible guardar la visita en este dispositivo");
    }
  };

  return (
    <div className="offlineAction">
      <button type="button" className="button primary" onClick={prepareVisit}>
        Preparar visita offline
      </button>
      <span role="status">{message || `${pending} pendiente${pending === 1 ? "" : "s"}`}</span>
    </div>
  );
}
