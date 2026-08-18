import type { Metadata } from "next";
import { FieldFlow } from "./field-flow";

export const metadata: Metadata = {
  title: "Mi misión",
  description: "Activa y comienza una misión de campo sin contraseñas ni formularios largos.",
  // Igual que Operaciones: se entra por invitación, no por buscador.
  robots: { index: false, follow: false },
};

export default function FieldPage() {
  return <FieldFlow />;
}
