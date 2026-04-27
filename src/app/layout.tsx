import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "./providers";

export const metadata: Metadata = {
  title: "Order Management Hub",
  description: "PO PDF extraction and CSV-driven shipment consolidation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark-ops" suppressHydrationWarning>
      <body className="min-h-screen antialiased bg-[var(--surface)] text-[var(--text)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
