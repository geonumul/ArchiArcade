-- AlterTable
-- 게임 신청 목록을 공용 키-값 저장소에서 옮겨 온다. 그 저장소는 누구나 쓸 수 있어서
-- 아무나 목록 전체를 빈 배열로 덮어쓸 수 있었다. 제보와 규칙이 같으므로 같은 표에 둔다.
ALTER TABLE "Report" ADD COLUMN     "board" TEXT NOT NULL DEFAULT 'report';

-- CreateIndex
CREATE INDEX "Report_board_createdAt_idx" ON "Report"("board", "createdAt");
