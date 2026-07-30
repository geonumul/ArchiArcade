-- 방 정원(maxPlayers)과 현재 인원(playerCount), 그리고 버려진 방을 걸러내기 위한 updatedAt.
-- updatedAt 은 Prisma 가 애플리케이션 단에서 갱신하지만 이미 존재하는 행에도 값이 필요하므로
-- DB 기본값을 함께 준다. 없으면 NOT NULL 제약 때문에 기존 행이 있는 순간 마이그레이션이 실패한다.
ALTER TABLE "Room"
  ADD COLUMN "maxPlayers"  INTEGER      NOT NULL DEFAULT 30,
  ADD COLUMN "playerCount" INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 최근 활동한 방만 세는 집계를 위한 인덱스.
CREATE INDEX "Room_updatedAt_idx" ON "Room"("updatedAt");
