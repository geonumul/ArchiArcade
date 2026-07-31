-- CreateTable
-- 설계자 맞히기 문제 후보 보관함. 화면이 쓰는 은행(public/quiz-architect.js)과는 무관한,
-- "아직 내보내지 않은" 문항이다. 한 번에 다 풀어 놓으면 지금도 어렵다는 게임이 더
-- 어려워지므로 모아만 두고 내보내는 것은 따로 정한다.
--
-- 조사에 든 품이 크고 다시 만들기 어려운 자료라 코드 밖에 둔다. 파일로만 갖고 있으면
-- 브랜치를 정리하다 사라진다.
--
-- 설계자를 번호가 아니라 이름으로 들고 있는 이유가 있다. 번호는 은행을 다시 만들 때마다
-- 달라져서, 나중에 맞춰 보면 엉뚱한 사람이 정답이 되어 있다. 이름은 안 변한다.
CREATE TABLE "ArchqCandidate" (
    "id" SERIAL NOT NULL,
    "archLa" TEXT NOT NULL,
    "archKo" TEXT NOT NULL,
    "archJa" TEXT NOT NULL,
    "archZh" TEXT NOT NULL,
    "archTw" TEXT NOT NULL,
    "la" TEXT NOT NULL,
    "ko" TEXT NOT NULL,
    "ja" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "tw" TEXT NOT NULL,
    "y" INTEGER NOT NULL,
    "c" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "shipped" BOOLEAN NOT NULL DEFAULT false,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchqCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 건물 이름으로 중복을 가른다. 같은 건물이 두 조사에서 나와도 한 줄만 남는다.
CREATE UNIQUE INDEX "ArchqCandidate_la_key" ON "ArchqCandidate"("la");

-- CreateIndex
CREATE INDEX "ArchqCandidate_batch_idx" ON "ArchqCandidate"("batch");
CREATE INDEX "ArchqCandidate_shipped_idx" ON "ArchqCandidate"("shipped");
CREATE INDEX "ArchqCandidate_c_idx" ON "ArchqCandidate"("c");
