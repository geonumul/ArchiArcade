-- AlterTable
-- 기존 인증은 학교 메일로 방금 확인한 사람들이라 재학 중으로 보는 것이 맞다.
ALTER TABLE "StudentVerification" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'student';

-- CreateIndex
-- 목록에서 재학/졸업으로 나눠 보는 조회가 인덱스를 타게 한다.
CREATE INDEX "StudentVerification_schoolDomain_status_idx" ON "StudentVerification"("schoolDomain", "status");
