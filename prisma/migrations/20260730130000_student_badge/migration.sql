-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "major" TEXT,
ADD COLUMN     "schoolDomain" TEXT;

-- 참고: prisma migrate diff 는 여기서 Room.updatedAt 의 DB 기본값을 없애자고 제안하지만
-- 일부러 남겨둔다. Prisma 는 항상 값을 채워 보내므로 기본값이 있어도 동작이 달라지지 않고,
-- 원시 SQL 로 행을 넣는 경로에서는 NOT NULL 위반을 막아주는 안전장치가 된다.

-- AlterTable
ALTER TABLE "Vote" ADD COLUMN     "major" TEXT,
ADD COLUMN     "schoolDomain" TEXT;

-- CreateTable
CREATE TABLE "StudentVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "schoolDomain" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "major" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "directoryOptIn" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT,
    "gradYear" INTEGER,
    "company" TEXT,

    CONSTRAINT "StudentVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifyCode" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifyCode_pkey" PRIMARY KEY ("email")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentVerification_email_key" ON "StudentVerification"("email");

-- CreateIndex
CREATE INDEX "StudentVerification_schoolDomain_major_idx" ON "StudentVerification"("schoolDomain", "major");

-- CreateIndex
CREATE INDEX "StudentVerification_schoolDomain_directoryOptIn_idx" ON "StudentVerification"("schoolDomain", "directoryOptIn");

-- CreateIndex
CREATE INDEX "Post_schoolDomain_createdAt_idx" ON "Post"("schoolDomain", "createdAt");

-- CreateIndex
CREATE INDEX "Vote_schoolDomain_idx" ON "Vote"("schoolDomain");

