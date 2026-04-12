import type { Metadata } from "next";
import "./globals.css";
import { bodoniSwashesItalic, virust } from "./fonts";

export const metadata: Metadata = {
  title: 'Omar & Hager’s Wedding RSVP',
  description: 'June 6, 2026 • Plano, Texas',
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${virust.variable} ${bodoniSwashesItalic.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
