# 설계실 오락실 · ARCHI ARCADE

밤샘하는 건축학도를 위한 온라인 오락실 — 9개 언어로 즐기는 건축학과 밸런스게임과, 앞으로 열릴 글로벌 건축학도 커뮤니티.

An online arcade for exhausted architecture students — a studio-culture balance game in 9 languages, growing into a global community platform.

## 지금 플레이 가능
- **건축학과 밸런스게임** — 154문항 × 9개 언어(한국어·English·简体中文·繁體中文·日本語·Français·Italiano·Deutsch·Español), 언어별 문화 현지화(각국 거장·답사지·야식)
- 솔로 모드 / 라이브 방(호스트·비밀번호·제한시간 투표) / 전세계 익명 통계 합산
- 회원 카드(닉네임+비밀번호, PBKDF2), 판수 칭호 시스템
- 게임 신청 보드 · 질문 공작소(AI 문맥 검열)
- 8비트 칩튠 BGM(자체 작곡) · BGM/SFX/볼륨 컨트롤

## 실행
정적 파일 하나입니다. `index.html`을 브라우저로 열거나:
```bash
npx serve .
```
> 공유 저장(투표 합산·게시판)과 AI 검열은 호스팅 환경의 storage/모더레이션 프록시가 필요합니다. 로컬에서는 게임플레이 UI만 확인됩니다. 백엔드 이전 설계는 `docs/PHASE2.md` 참고.

## 로드맵
`docs/PHASE2.md` — 실서비스 백엔드(DB·인증·AI 번역 커뮤니티) 설계.

## 폰트 라이선스
임베드된 픽셀 폰트들의 고지는 `LICENSE-FONTS.md` 참고 (모두 SIL OFL 1.1).
