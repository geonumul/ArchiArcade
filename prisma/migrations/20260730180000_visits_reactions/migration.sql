-- CreateTable
-- 날짜별 유입 집계. 개인을 특정하는 값이 한 칸도 없다 - IP·쿠키·기기 식별자를
-- 저장하지 않고 조합별 숫자만 센다. 그래서 개인정보 보호법의 적용 대상이 아니다.
CREATE TABLE "VisitStat" (
    "day" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "signups" INTEGER NOT NULL DEFAULT 0,
    "verifies" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VisitStat_pkey" PRIMARY KEY ("day","channel","device","lang")
);

-- CreateIndex
CREATE INDEX "VisitStat_day_idx" ON "VisitStat"("day");

-- CreateTable
-- 한 사람이 한 문항에 한 번만 누르게 한다. 노잼 수가 밸런스 조절 후보를 정하는
-- 근거가 되므로, 같은 사람이 여러 번 눌러 부풀릴 수 있으면 기준이 무의미해진다.
CREATE TABLE "ReactionVote" (
    "questionIdx" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionVote_pkey" PRIMARY KEY ("questionIdx","userId")
);

-- CreateIndex
CREATE INDEX "ReactionVote_userId_idx" ON "ReactionVote"("userId");

-- AddForeignKey
ALTER TABLE "ReactionVote" ADD CONSTRAINT "ReactionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
