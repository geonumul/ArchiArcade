import type { Metadata } from "next";
import { SponsorDesk } from "@/components/SponsorDesk";

export const metadata: Metadata = {
  title: "스폰서 · 제휴 문의",
  description: "ARCHI ARCADE 에 스폰서·조직 방·채용으로 함께하고 싶은 곳을 위한 창구.",
};

export default function SponsorPage() {
  return <SponsorDesk />;
}
