-- AlterTable
-- 노잼이 다섯 번 쌓이면 밸런스 조절 후보로 올린다. 어느 문항이 재미없는지는
-- 사람들이 이미 알고 있는데, 그걸 모아 볼 자리가 없었다.
ALTER TABLE "QuestionReact" ADD COLUMN     "flaggedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "QuestionReact_flaggedAt_idx" ON "QuestionReact"("flaggedAt");
