import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SubSmart Protocol | Pitch Deck",
  description:
    "Decentralized, non-custodial recurring billing. Zero lockups. Instant yield. Built on Polygon.",
  openGraph: {
    title: "SubSmart Protocol | Pitch Deck",
    description:
      "Decentralized, non-custodial recurring billing. Zero lockups. Instant yield. Built on Polygon.",
    url: "https://subsmart.xyz/deck",
    siteName: "SubSmart Protocol",
    type: "website",
    images: [
      {
        url: "/deck/opengraph-image",
        width: 1200,
        height: 630,
        alt: "SubSmart Protocol — Decentralized Recurring Billing",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SubSmart Protocol | Pitch Deck",
    description:
      "Decentralized, non-custodial recurring billing. Zero lockups. Instant yield.",
    images: ["/deck/opengraph-image"],
  },
};

export default function DeckLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return <>{children}</>;
}
