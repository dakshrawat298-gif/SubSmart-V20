import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NetworkGate } from "@/components/web3/NetworkGate";
import { GlobalNav } from "@/components/GlobalNav";

export const metadata: Metadata = {
  title: "SubSmart V2.0",
  description:
    "Decentralized, non-custodial recurring billing protocol for Web3 SaaS on Polygon.",
};

export const viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          <GlobalNav />
          {children}
          <NetworkGate />
        </Providers>
      </body>
    </html>
  );
}
