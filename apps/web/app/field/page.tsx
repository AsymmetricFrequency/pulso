import type { Metadata } from "next";
import { FieldFlow } from "./field-flow";

export const metadata: Metadata = {
  title: "Mi misión | PULSO VIDA",
  description: "Activa y comienza una misión de campo sin contraseñas ni formularios largos.",
};

export default function FieldPage() {
  return <FieldFlow />;
}
