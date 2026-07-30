# PHASE 2 — 실서비스 백엔드 이전 설계

현재 index.html은 단일 파일 SPA + 공유 key-value 저장소 가정으로 동작한다.
아래는 VSCode 개발·배포 단계의 목표 아키텍처.

## 스택 제안
- Next.js(App Router) + PostgreSQL(Prisma) + Vercel 배포
- 인증: argon2id 해시, httpOnly 쿠키 JWT + refresh 로테이션, Google/Apple OAuth 병행, 로그인 rate limit
- 실시간 방: 폴링 → WebSocket(또는 Supabase Realtime/Pusher) 승격

## 저장 키 → 테이블 매핑
| 현재 key | 테이블 |
|---|---|
| abg-user-{name} | users(id, name, pw_hash, locale, created_at) + profiles(user_id, plays, minor_picks) |
| archbal-bank-v4 (질문별 {a,b}) | votes(question_id, choice, lang, created_at) — 집계 뷰로 a/b 산출 |
| abg2-{code}-* (방 상태/참가/투표) | rooms, room_players, room_votes (24h TTL 잡 유지) |
| arcade-ideas-v1 / arcade-qfeedback-v1 | posts(board, author, body, type, created_at) |
| arcade-qreact-v1 | question_reacts(question_id, kind, count) |
| arcade-interest-v1 | feature_interest(feature, lang, count) — 시장별 수요 검증 데이터 |

질문 은행은 questions(id, idx, lang, q, a, b, is_local_variant) 로 정규화 —
로컬 변형 문항(idx 69/70/84/96/114/115 등)은 is_local_variant로 표시해
글로벌 비교 리포트에서 분리 집계한다.

## AI 기능의 서버 이전
- 콘텐츠 검열: 클라이언트 직호출 → 서버 프록시(/api/moderate)로 이동, 키 은닉·감사로그
- 커뮤니티 번역: 글은 원어로 저장, 열람 언어로 온디맨드 번역(언어별 톤 프롬프트) 후 lang별 캐시

## 배포 전 체크리스트
- [ ] 관리자 인증을 서버 세션으로 교체 (클라이언트 해시 제거)
- [ ] 게시판 rate limit·신고 기능
- [ ] 폰트 서브셋 재생성 파이프라인(fonttools) 스크립트화
- [ ] 언어별 문항 CSV 내보내기 → 커뮤니티 번역(Crowdin류) 연동
