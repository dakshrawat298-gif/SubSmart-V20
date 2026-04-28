import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubSmart V2.0",
  description:
    "Decentralized, non-custodial recurring billing protocol for Web3 SaaS on Polygon.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
