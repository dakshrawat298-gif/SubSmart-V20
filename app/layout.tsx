import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NetworkGate } from "@/components/web3/NetworkGate";
import { GlobalNav } from "@/components/GlobalNav";
import { WalletConnectedToast } from "@/components/web3/WalletConnectedToast";
import { GlobalToast } from "@/components/ui/GlobalToast";

export const metadata: Metadata = {
  title: "SubSmart V2.0",
  description:
    "Decentralized, non-custodial recurring billing protocol for Web3 SaaS on Polygon.",
};

export const viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  // Prevent iOS Safari from zooming on input focus and on double-tap.
  // "user-scalable=no" alone is insufficient on iOS 10+ — maximumScale=1
  // is the reliable override for WebKit-based browsers.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body
        className="bg-black text-white min-h-screen"
        suppressHydrationWarning
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        <Providers>
          <GlobalNav />
          {children}
          <NetworkGate />
          <WalletConnectedToast />
          <GlobalToast />
        </Providers>
      </body>
    </html>
  );
}
