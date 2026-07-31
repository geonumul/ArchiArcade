-- AlterTable
-- 학교 이름을 영문과 현지어 둘로 나눈다. 한 칸뿐이라 순위 화면에 "가톨릭대학교" 와
-- "Soongsil University" 가 나란히 떠서 규칙이 없어 보였다. 이제 영문을 크게 쓰고
-- 현지어를 작게 붙인다. 현지어 출처가 없는 학교는 비어 있고, 그러면 영문만 나온다.
ALTER TABLE "StudentVerification" ADD COLUMN     "schoolLocal" TEXT;
