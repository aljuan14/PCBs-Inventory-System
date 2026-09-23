import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";
import "leaflet/dist/leaflet.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PCBs Inventory Dashboard | Prototipe Inventarisasi & Pengolahan",
  description: "Sistem Inventarisasi Polychlorinated Biphenyls (PCBs) dari berkas Excel multi-perusahaan dengan pemetaan kolom dan peta spasial GIS.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      data-theme="light"
      style={{ colorScheme: 'light' }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body 
        style={{ colorScheme: 'light' }}
        className="min-h-full flex bg-[#f4f5f2] text-slate-900 font-sans"
      >
        <Navbar />
        <main className="min-w-0 flex-1">{children}</main>
      </body>
    </html>
  );
}
