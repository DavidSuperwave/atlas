import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import Sidebar from "../components/Sidebar";
import { AuthProvider } from "../components/AuthProvider";
import FloatingCreditBar from "../components/FloatingCreditBar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Atlas",
  description: "Private Market Intelligence Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} antialiased flex min-h-screen bg-gray-50`}
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        <AuthProvider>
          <Sidebar />
          <main className="flex-1 overflow-y-auto h-screen min-w-0">
            {children}
          </main>
          <FloatingCreditBar />
        </AuthProvider>
      </body>
    </html>
  );
}
