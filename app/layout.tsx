import type { Metadata } from "next";
import "./globals.css";
import { geistMono, geistSans, virust } from "./fonts";

export const metadata: Metadata = {
  title: 'Omar & Hager’s Wedding RSVP',
  description: 'June 6, 2026 • Plano, Texas',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${virust.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
