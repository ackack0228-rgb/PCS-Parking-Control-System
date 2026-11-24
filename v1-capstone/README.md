# v1 — 캡스톤 디자인 버전

캡스톤 디자인 제출·발표(**2026-06-02**) 당시의 원본 코드입니다. 기능은 그대로 두고 **보안 수정만** 적용했습니다 → [SECURITY.md](SECURITY.md)
정리된 버전은 [`../v2-upgrade`](../v2-upgrade)를 보세요.

| 폴더 | 내용 |
|---|---|
| [`Resident and Admin Dashboard/`](<Resident and Admin Dashboard>) | 프론트엔드: 관리자·입주민 웹 대시보드 (React + TypeScript + Vite) |
| [`smart-parking/`](smart-parking) | `backend/` Express API·RabbitMQ consumer, `ai/` AI 카메라 서비스, `db/` 스키마·시드, `infra/` Docker Compose·MediaMTX, `PROGRESS.md` 초기 진행 기록 |

## 참고

- 발표 당시 개발 PC의 두 폴더를 그대로 옮겼고, 이후 보안 수정만 더했습니다 (API 인증, 입력 검증, 포트 제한, 의존성 업데이트, 개인 경로 제거).
- 실행해 보려면 정리된 v2를 쓰는 것을 권장합니다.
- 당시 코드에는 동작하지 않거나 쓰지 않는 코드가 섞여 있습니다. 예를 들면 AI 어시스턴트 `/chat`(`ANTHROPIC_API_KEY` 필요), `/debug/*`, Flask `--server` 모드, 구버전 페이지, `smart-parking/frontend/`(Vite 기본 템플릿)가 있어요. v2에서 정리했습니다. (이 엔드포인트들도 지금은 관리자 로그인이 있어야 호출됩니다)
