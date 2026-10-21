import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "@/components/Navbar";
import { DialogHost } from "@/components/Dialog";
import Preloader from "@/components/Preloader";
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
  title: "Sistem Inventarisasi PCBs | Direktorat B3",
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
      suppressHydrationWarning
      style={{ colorScheme: 'light' }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* The preloader only once per browser session: marked before the first paint. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: "try{if(sessionStorage.getItem('pcbs-preloader'))document.documentElement.dataset.preloaded='1'}catch(e){}" }} />
      </head>
      <body 
        style={{ colorScheme: 'light' }}
        className="min-h-full flex bg-[#f4f5f2] text-slate-900 font-sans"
      >
        <Navbar />
        <main className="min-w-0 flex-1">{children}</main>
        <DialogHost />
        <Preloader />
      </body>
    </html>
  );
}
