import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./providers";
import Nav from "./components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LockHub",
  description: "Lock In. Win Big. Repeat.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-white antialiased">
        <Providers>
          <Nav />
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
