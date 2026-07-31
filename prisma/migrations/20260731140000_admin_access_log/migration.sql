-- CreateTable
-- 관리자 접속기록. 「개인정보의 안전성 확보조치 기준」 고시 제8조가 개인정보취급자의
-- 접속기록을 1년 이상 보관하도록 정하고 있어 두는 표다. 선택이 아니라 의무이고,
-- 규모가 작다고 빠지는 예외가 없다 - 없으면 법 제29조 위반으로 과태료 대상이 된다.
-- 남는 것은 회원 정보를 들여다본 운영자 쪽뿐이다. 게임하러 온 사람의 접속은 여기
-- 쌓이지 않는다. 2026-10-31 시행 개정문도 정보주체를 명시적으로 뺀다.
-- 다섯 칸은 고시 제2조제3호가 요구하는 항목 그대로이며, 하나라도 비면 접속기록으로
-- 인정되지 않는다. admin=식별자, createdAt=접속일시, ip=접속지 정보,
-- subject=처리한 정보주체 정보, action=수행업무.
-- ip 만 원문으로 남긴다. 다른 표에서는 IP 를 저장하지 않고 도배 방지도 해시로 하지만,
-- 접속지 정보는 해시로 바꾸면 기록으로 성립하지 않아서 여기서는 어쩔 수 없다.
-- 보관은 1년. 정보주체 5만 명 미만이고 고유식별정보·민감정보가 없어 2년 대상이 아니다.
-- 지우는 배치를 나중에 붙이더라도 1년보다 짧게 자르지 말 것.
CREATE TABLE "AdminAccessLog" (
    "id" BIGSERIAL NOT NULL,
    "admin" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 고시 제8조는 이 기록을 월 1회 이상 점검하라고도 한다. 점검은 늘 최근 것부터
-- 훑으므로 그 조회가 인덱스를 타게 한다.
CREATE INDEX "AdminAccessLog_createdAt_idx" ON "AdminAccessLog"("createdAt");

-- CreateIndex
-- 관리자가 여럿이 되면 "이 사람이 무엇을 봤나"로도 갈라 봐야 한다.
CREATE INDEX "AdminAccessLog_admin_createdAt_idx" ON "AdminAccessLog"("admin", "createdAt");
