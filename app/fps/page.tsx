import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Vanguard Protocol — FPS",
  description: "Browser-based first-person shooter arena demo, built in Three.js.",
};

const FpsGame = dynamic(() => import("@/components/fps/FpsGame"), { ssr: false });

export default function FpsPage() {
  return <FpsGame />;
}
