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
- 에러 추적 Sentry, 배포마다 스모크 체크리스트(CLAUDE.md 하단) 수행
- 문항 추가 파이프라인: /data/questions CSV 내보내기 → 번역 → 9개 파일 동시 갱신(인덱스 정렬 검증 스크립트 필수)
- 폰트 재서브셋: `pyftsubset` 스크립트를 /scripts에 추가해 사용 글자 변경 시 재생성
- 백업: Neon 브랜치 스냅샷 주 1회, 배포 태그는 semver(v3.0.0부터 백엔드 시대)
