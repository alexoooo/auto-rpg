import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warrior Study",
  description: "An independent 3D warrior turntable experiment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
