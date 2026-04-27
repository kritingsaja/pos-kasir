import type { Metadata } from "next";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";
import OfflineIndicator from "@/components/OfflineIndicator";

export const metadata: Metadata = {
  title: "KasirPOS - Aplikasi Kasir Modern",
  description: "Aplikasi kasir (POS) modern berbasis web",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <OfflineIndicator />
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
