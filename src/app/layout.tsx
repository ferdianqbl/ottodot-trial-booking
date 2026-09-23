import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppHeader from "@/components/layout/app-header";
import { PageContent } from "@/components/shared/page-content";
import Providers from "@/providers";
import "./globals.css";

// Substitute for ABC Favorit (docs/DESIGN.md); feeds the --font-abc-favorit stack in globals.css.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Ottodot · Trial class booking",
  description: "Book and pay for a live online trial class; staff see the confirmed roster.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen">
        <Providers>
          <AppHeader />
          <PageContent>{children}</PageContent>
        </Providers>
      </body>
    </html>
  );
}
