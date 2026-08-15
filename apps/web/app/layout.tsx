import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://pulso.my"),
  title: "PULSO",
  description: "Coordinación territorial verificable para emergencias",
  applicationName: "PULSO",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PULSO",
    description: "Coordinación territorial verificable para emergencias",
    siteName: "PULSO",
    type: "website",
    url: "/",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "PULSO — Información territorial para actuar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PULSO",
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
