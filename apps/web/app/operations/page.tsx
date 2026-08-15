import type { Metadata } from "next";
import { OperationsFlow } from "./operations-flow";

export const metadata: Metadata = {
  title: "Centro operacional | PULSO",
  description: "Resumen protegido y verificable de una emergencia.",
};

export default function OperationsPage() {
  return <OperationsFlow />;
}
