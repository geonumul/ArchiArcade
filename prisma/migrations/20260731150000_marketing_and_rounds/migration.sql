-- CreateTable
-- 광고성 정보 수신 동의. 서비스 안내 메일은 계약 이행에 관한 정보라 동의 없이 보낼 수
-- 있지만, "새 게임 열렸어요" 는 광고성 정보여서 정보통신망법 제50조상 명시적 사전
-- 동의 없이는 한 통도 못 보낸다. 지금 자리를 만들어 두지 않으면 나중에 되돌릴 수 없다.
-- 기본값을 false 로 두는 것이 중요하다. 미리 체크된 동의는 명시적 동의로 인정되지 않는다.
CREATE TABLE "MarketingConsent" (
    "userId" TEXT NOT NULL,
    "agreed" BOOLEAN NOT NULL DEFAULT false,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
-- 계정을 지우면 동의 기록도 함께 사라진다. 본인의 의사표시이므로 남길 이유가 없다.
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
-- 한 판이 어떻게 끝났는지에 대한 집계. 누가 했는지는 넣지 않고 그날의 합만 센다.
-- 방문 수와 플레이 수만으로는 "재미없어서 나갔다" 를 볼 수 없다. 시작한 판 중 몇 개가
-- 끝까지 갔는지, 평균 몇 문항에서 멈추는지가 문항을 손볼 근거가 된다.
CREATE TABLE "RoundStat" (
    "day" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "started" INTEGER NOT NULL DEFAULT 0,
    "finished" INTEGER NOT NULL DEFAULT 0,
    "answered" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RoundStat_pkey" PRIMARY KEY ("day","game","device","lang","country")
);

-- CreateIndex
CREATE INDEX "RoundStat_day_idx" ON "RoundStat"("day");
