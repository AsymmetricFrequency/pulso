import type { Metadata } from "next";
import { AdminPanel } from "./admin-panel";

export const metadata: Metadata = {
  title: "Panel · PULSO",
  description: "Estado de la operación y del equipo que construye Pulso.",
  // Es una herramienta interna: no tiene por qué aparecer en un buscador.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
