-- CreateTable
-- 설계자 맞히기 기록. 모드마다 따로 겨룬다 - 10문항과 30문항을 한 표에 섞으면
-- 문항 수가 많은 쪽이 무조건 유리해서 순위가 뜻을 잃고, 타임어택은 단위가 아예 다르다.
--
-- 기본키를 (userId, mode) 로 잡아 한 사람당 모드별로 한 줄만 남긴다. 판마다 줄을
-- 쌓으면 많이 한 사람이 순위표를 도배하게 되는데, 남기고 싶은 것은 그 사람의 최고
-- 기록이지 판 수가 아니다.
CREATE TABLE "ArchqScore" (
    "userId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "secs" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchqScore_pkey" PRIMARY KEY ("userId","mode")
);

-- CreateIndex
-- 순위표는 모드별로 점수 높은 순, 같으면 빠른 순으로 뽑는다.
CREATE INDEX "ArchqScore_mode_score_secs_idx" ON "ArchqScore"("mode", "score", "secs");

-- AddForeignKey
-- 계정을 지우면 기록도 함께 사라진다.
ALTER TABLE "ArchqScore" ADD CONSTRAINT "ArchqScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
