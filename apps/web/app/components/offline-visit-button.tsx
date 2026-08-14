"use client";

import { useEffect, useState } from "react";
import { countQueuedVisits } from "../lib/offline-visit-queue";

export function FieldEntryLink() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    countQueuedVisits()
      .then(setPending)
      .catch(() => setPending(0));
  }, []);

  return (
    <div className="offlineAction">
      <a className="button primary" href="/field">
        Abrir vista de brigada
      </a>
      <span>
        {pending > 0
          ? `${pending} visita${pending === 1 ? "" : "s"} por sincronizar`
          : "Lista para trabajar sin conexión"}
      </span>
    </div>
  );
}
