-- CreateTable
CREATE TABLE "Kv" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kv_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Kv_expiresAt_idx" ON "Kv"("expiresAt");

-- 접두사 조회(`key LIKE 'abg2-1234-v0g0-%'`)가 인덱스를 타게 한다.
-- 기본 collation 의 PK 인덱스로는 LIKE 접두사 스캔이 잡히지 않아, 방마다
-- 표를 모으는 폴링이 매번 풀스캔으로 떨어진다.
CREATE INDEX "Kv_key_prefix_idx" ON "Kv"("key" text_pattern_ops);
