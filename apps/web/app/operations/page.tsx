import type { Metadata } from "next";
import { OperationsFlow } from "./operations-flow";

export const metadata: Metadata = {
  title: "Centro operacional",
  description: "Resumen protegido y verificable de una emergencia.",
  // Herramienta interna detrás de sesión: indexarla llena los buscadores de pantallas de acceso.
  robots: { index: false, follow: false },
};

export default function OperationsPage() {
  return <OperationsFlow />;
}
