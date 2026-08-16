-- CreateTable
-- 가입 대기중인 계정. 메일 소유를 확인하기 전까지는 User 를 만들지 않는다.
-- PasswordReset 과 같은 방식으로 코드는 해시만 남긴다.
CREATE TABLE "PendingRegistration" (
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pwHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("email")
);
