import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CupPreview from "./CupPreview";

/**
 * Dev only: try a drawing on the cup, turn it, save the PNG. In production
 * this route does not exist.
 */
export const metadata: Metadata = { title: "Cup render (dev)", robots: { index: false } };

export default function DevCupPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <CupPreview />;
}
