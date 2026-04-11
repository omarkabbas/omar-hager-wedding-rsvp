import type { Metadata } from "next";
import "./globals.css";
import { virust } from "./fonts";

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
      <body className={`${virust.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
