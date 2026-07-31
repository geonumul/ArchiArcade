-- CreateTable
-- 본인만 읽는 개인 응답 기록. Vote 는 익명이라 userId 가 없고, 앞으로도 넣지
-- 않는다 - 전역 집계가 사람과 이어지면 솔직하게 누를 수 없게 되기 때문이다.
-- 대신 "내가 답한 것 중 몇 번이 소수파였나"를 돌려주려면 본인 것이 어딘가에는
-- 남아야 해서, 익명 집계와 완전히 분리된 표를 따로 둔다.
-- 기본키를 (userId, questionIdx) 로 잡아 같은 문항을 다시 풀면 줄이 늘지 않고
-- 마지막 선택으로 덮이게 한다.
CREATE TABLE "AnswerLog" (
    "userId" TEXT NOT NULL,
    "questionIdx" INTEGER NOT NULL,
    "choice" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnswerLog_pkey" PRIMARY KEY ("userId","questionIdx")
);

-- AddForeignKey
-- 계정을 지우면 그 사람의 응답 기록도 함께 사라진다. 본인 것이므로 남길 이유가 없다.
ALTER TABLE "AnswerLog" ADD CONSTRAINT "AnswerLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
