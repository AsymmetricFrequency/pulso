import type { Metadata } from "next";
import { FieldFlow } from "./field-flow";

export const metadata: Metadata = {
  title: "Mi misión | PULSO ATLAS",
  description: "Activa y comienza una misión de campo sin contraseñas ni formularios largos.",
};

export default function FieldPage() {
  return <FieldFlow />;
}
