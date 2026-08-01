-- CreateTable
-- 스폰서·제휴 문의함.
--
-- 메일로만 흘려보내면 RESEND_API_KEY 가 비어 있거나 Resend 가 잠깐 죽었을 때 문의가
-- 흔적 없이 사라진다. 문의 하나가 첫 계약일 수 있으므로 저장이 먼저고 발송이 나중이다.
-- mailed=false 인 줄은 메일이 못 나간 문의라, 사람이 직접 찾아가야 한다.
CREATE TABLE "SponsorInquiry" (
    "id" TEXT NOT NULL,
    "org" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "lang" TEXT NOT NULL DEFAULT 'ko',
    "mailed" BOOLEAN NOT NULL DEFAULT false,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 아직 답하지 않은 문의를 오래된 순으로 꺼내는 것이 유일한 조회 경로다.
CREATE INDEX "SponsorInquiry_handled_createdAt_idx" ON "SponsorInquiry"("handled", "createdAt");
