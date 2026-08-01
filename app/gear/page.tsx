import type { Metadata } from "next";
import { GearShelf } from "@/components/GearShelf";

export const metadata: Metadata = {
  title: "밤샘 장비",
  description: "설계실에서 반드시 떨어지는 것들 — 무엇이 필요한지와, 온라인·오프라인 어디서 구하는지.",
};

export default function GearPage() {
  return <GearShelf />;
}
