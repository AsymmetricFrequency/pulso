import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my"),
  title: "PULSO VIDA",
  description: "Coordinación territorial verificable para emergencias",
  applicationName: "PULSO VIDA",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PULSO VIDA",
    description: "Coordinación territorial verificable para emergencias",
    siteName: "PULSO VIDA",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "PULSO VIDA — Información territorial para actuar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PULSO VIDA",
    description: "Información territorial para actuar",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
