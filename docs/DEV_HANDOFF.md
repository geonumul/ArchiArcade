# DEV HANDOFF — VSCode에서 AI에게 시킬 단계별 오더

> 사용법: 아래 STEP을 순서대로, 한 번에 하나씩 AI 코딩 어시스턴트에게 지시한다.
> 각 STEP은 "실행 가능한 상태"로 끝나야 하며 별도 커밋한다.

## 스택 결정 (권장)
- **프론트/서버**: Next.js 14 (App Router, TypeScript) — Vercel 배포
- **DB**: Postgres — **Neon**(Vercel 연동 간편) + **Prisma** ORM
- **실시간 방**: v1은 현행 폴링 유지 → v2에서 Pusher 또는 Supabase Realtime 승격
- **레이트리밋/캐시**: Upstash Redis
- 대안: DB+실시간+스토리지 일괄이면 Supabase 단일 채택도 가능(운영 단순). 팀 선호로 결정.

## STEP 0 — 리포 구조화
"index.html을 Next.js 프로젝트로 분해해줘. /app/page.tsx(게임 셸), /public/fonts(내장 base64 폰트를 파일로 추출),
/lib/i18n/{ko,en,zh,tw,ja,fr,it,de,es}.json(UI 사전), /data/questions/{lang}.json(각 154문항),
게임 로직은 /lib/game/*.ts 모듈로. 동작 동일성이 우선 — 리팩터링 중 기능 변경 금지."

## STEP 1 — DB & Prisma
"Prisma를 설정하고 아래 스키마로 마이그레이션 생성해줘. DATABASE_URL은 .env."
```prisma
model User      { id String @id @default(cuid())  name String @unique  pwHash String  locale String @default("ko")  createdAt DateTime @default(now())  profile Profile? }
model Profile   { userId String @id  plays Int @default(0)  minorPicks Int @default(0)  user User @relation(fields:[userId], references:[id]) }
model Question  { id Int @id @default(autoincrement())  idx Int  lang String  q String  a String  b String  isLocalVariant Boolean @default(false)  @@unique([idx, lang]) }
model Vote      { id BigInt @id @default(autoincrement())  questionIdx Int  choice String  lang String  roomCode String?  createdAt DateTime @default(now())  @@index([questionIdx]) }
model Room      { code String @id  pwHash String  hostId String?  state Json  expiresAt DateTime }
model Post      { id Int @id @default(autoincrement())  board String  author String  body String  type String?  lang String  createdAt DateTime @default(now()) }
model QuestionReact { questionIdx Int @id  hot Int @default(0)  meh Int @default(0) }
model FeatureInterest { feature String  lang String  count Int @default(0)  @@id([feature, lang]) }
```
"기존 window.storage 호출을 /api/* 라우트로 교체하는 어댑터 계층(/lib/store.ts)을 만들어 프론트 수정을 최소화해줘."

## STEP 1.5 — 수익화 스키마 (B2B·스폰서·채용·데이터)
> 개인 학생은 영원히 무료·무광고. 과금은 조직(Org) 단위로만 발생한다.
> STEP 1 직후에 넣어야 하는 이유: 세션 라이선스·스폰서 카트리지·채용 수수료가 전부 "누가 방을 열었나"를 기록해야 성립하는데,
> 그 기록은 Room이 처음 생기는 시점부터 남기지 않으면 소급이 불가능하다.

"아래 모델을 Prisma 스키마에 추가하고 마이그레이션을 만들어줘. Room에 orgId·sponsorId(둘 다 nullable)를 추가해 개인 방과 조직 방을 같은 테이블에서 구분한다."
```prisma
model Org           { id String @id @default(cuid())  name String  kind String  // university | firm | society
                      seats Int @default(0)  billingEmail String  createdAt DateTime @default(now())  members OrgMember[] }
model OrgMember     { orgId String  userId String  role String @default("member")  // owner | admin | member
                      org Org @relation(fields:[orgId], references:[id])  @@id([orgId, userId]) }
model License       { id String @id @default(cuid())  orgId String  plan String  // session | seat | annual
                      seatsMax Int  sessionsMax Int?  startsAt DateTime  endsAt DateTime  status String @default("active") }
model SessionUsage  { id BigInt @id @default(autoincrement())  orgId String  roomCode String  players Int
                      startedAt DateTime  endedAt DateTime?  billable Boolean @default(true)  @@index([orgId, startedAt]) }
model QuestionSet   { id String @id @default(cuid())  orgId String  name String  logoUrl String?
                      items Json  // [{idx?, q, a, b, lang}] — 기본 154문항 위에 얹는 커스텀 세트
                      createdAt DateTime @default(now()) }
model Sponsor       { id String @id @default(cuid())  name String  cartridgeSlug String @unique  logoUrl String?
                      cpmCents Int  activeFrom DateTime  activeTo DateTime  status String @default("draft") }
model SponsorImpression { id BigInt @id @default(autoincrement())  sponsorId String  lang String  roomCode String?
                      shownAt DateTime @default(now())  @@index([sponsorId, shownAt]) }
model JobPost       { id String @id @default(cuid())  orgId String  title String  body String  lang String
                      feeCents Int  status String @default("open")  createdAt DateTime @default(now()) }
model JobApplication{ id String @id @default(cuid())  jobPostId String  userId String  status String @default("sent")
                      placedAt DateTime?  // 성사 시각 = 수수료 청구 트리거
                      createdAt DateTime @default(now())  @@unique([jobPostId, userId]) }
model ReportExport  { id String @id @default(cuid())  year Int  scope String  // global | lang | org
                      scopeKey String?  fileUrl String  generatedAt DateTime @default(now()) }
```
"그리고 다음 API를 추가해줘:
 - `/api/org/rooms` — 라이선스 검증 후 커스텀 방 생성(로고·QuestionSet 지정). 좌석/세션 초과 시 402.
 - `/api/org/report/[roomCode]` — 방 종료 후 결과 리포트(참여자 수·문항별 분포) PDF/CSV.
 - `/api/cron/usage-rollup` — SessionUsage를 일 단위로 집계해 청구 근거 생성(Vercel Cron).
 - `/api/sponsor/impression` — 스폰서 카트리지 노출 기록. 봇 필터 + IP 해시만 저장.
 - `/api/admin/report/annual` — Vote·QuestionReact·FeatureInterest를 국가×문항으로 합산해 ReportExport 생성.
결제 연동(Stripe)은 별도 STEP으로 분리하고, 여기서는 스키마·집계·권한까지만 만든다."

**주의:** 데이터 상품(연간 리포트)은 `is_local_variant` 문항을 반드시 분리 집계할 것 — 국가별 현지화 문항을 섞으면 비교 자체가 무의미해진다(PHASE2.md 참고).

## STEP 2 — 인증 실전화
"인증을 서버로 이전해줘: argon2id 해시, httpOnly 쿠키 JWT(+refresh 로테이션), /api/auth/register|login|logout|me.
로그인 5회 실패 시 Upstash로 60초 잠금. 기존 PBKDF2(v2) 사용자는 최초 로그인 성공 시 argon2로 재해시.
관리자: ADMIN_NAME/ADMIN_PW 해시를 env로 — 클라이언트 ADMIN_HASH 상수는 삭제."

## STEP 3 — AI 프록시
"/api/moderate 를 만들어 게시판 검열을 서버 경유로 바꿔줘(ANTHROPIC_API_KEY는 서버 env, 프론트 직호출 제거, 감사 로그 저장).
/api/translate 는 posts를 열람 언어로 번역해 TranslationCache(postId, lang, body) 테이블에 캐시."

## STEP 4 — Vercel 배포
"Vercel 프로젝트에 연결하고 .env.example 작성: DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, ADMIN_NAME, ADMIN_PW_HASH, UPSTASH_URL/TOKEN.
prisma migrate deploy를 빌드에 포함, main=프로덕션 / PR=프리뷰. rooms 만료 정리는 Vercel Cron(매시) /api/cron/cleanup."

## STEP 5 — 실시간 승격(선택)
"방 폴링을 Pusher 채널(room-{code})로 교체하되, 실패 시 폴링 폴백을 남겨줘."

## 유지보수 수칙
- 마이그레이션은 항상 `prisma migrate dev` 파일로 — DB 콘솔 수동 변경 금지
- 에러 추적 Sentry, 배포마다 스모크 체크리스트(아래 "배포 전 스모크") 수행
- 문항 추가 파이프라인: /data/questions CSV 내보내기 → 번역 → 9개 파일 동시 갱신(인덱스 정렬 검증 스크립트 필수)
- 폰트 재서브셋: `pyftsubset` 스크립트를 /scripts에 추가해 사용 글자 변경 시 재생성
- 백업: Neon 브랜치 스냅샷 주 1회, 배포 태그는 semver(v3.0.0부터 백엔드 시대)

## 배포 전 스모크 (모든 변경 후 필수)
- 문항 은행 9×154 카운트 일치, 참조 id 무결성, 브라우저 콘솔 에러 0
- 솔로 1판 / 방 생성 → 입장 → 투표 → 공개 / 언어 9종 전환 / 로그인·가입
- 픽셀 아트 디렉션 유지: 폰트는 CSS 변수(--kfont/--efont) 경유, 새 UI도 4px 보더·하드섀도·steps() 애니메이션 문법
- 문항 텍스트·게임 밸런스·9개 언어 번역은 소유자 지시 없이 수정 금지. 9개 은행의 1:1 인덱스 정렬(154개)은 전역 투표 합산의 기반이므로 절대 깨지 않는다
- 비밀값(ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, 관리자 크리덴셜)은 커밋 금지 — `.env`만, 예시는 `.env.example`
- 폰트는 전부 OFL — 재서브셋 시 `LICENSE-FONTS.md` 고지 유지
