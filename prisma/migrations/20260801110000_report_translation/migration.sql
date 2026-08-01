-- CreateTable
-- 게시글 번역 보관. 일본어로 보는 사람에게 한국어 글이 그대로 뜨면 무슨 말인지 모르는데,
-- 볼 때마다 번역을 부르면 돈이 나가고 느리다. 한 번 번역한 것은 여기 두고 다시 쓴다.
--
-- 글은 고쳐지지 않고 지워지기만 하므로 번역이 낡을 일이 없다. 원문이 사라지면 번역도
-- 함께 지운다.
CREATE TABLE "ReportTranslation" (
    "reportId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "madeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTranslation_pkey" PRIMARY KEY ("reportId","lang")
);

-- AddForeignKey
ALTER TABLE "ReportTranslation" ADD CONSTRAINT "ReportTranslation_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
