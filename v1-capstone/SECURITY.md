# 보안 패치 (v1)

v1은 캡스톤 원본을 보존하는 폴더지만, 공개 저장소에 있는 이상 같은 취약점을 그대로 둘 수 없어서 **기능은 바꾸지 않고 보안 수정만** 적용했습니다 (2026-11-24).
인증·권한 구조와 전체 점검 결과는 v2의 [SECURITY.md](../v2-upgrade/SECURITY.md)와 같습니다.

## v2와 같은 수정

- 백엔드 API: Lumi 로그인 토큰 검증 + 관리자 전용 / 본인 데이터만 권한 (`backend/security.js`). `/health`만 공개
- 쿼리 객체 주입 차단 (`?plate_no[plate_no]=1` 전체 유출), 에러 메시지 숨김, CORS 허용 목록, 요청 제한, 입력 검증
- 프론트: 모든 백엔드 요청에 토큰 첨부, Deno `backend-proxy` SSRF 차단·에러 메시지 숨김
- AI MJPEG 영상: 다른 기기는 관리자 토큰 필요, 다중 시청
- Docker: MySQL·Adminer·RabbitMQ 관리·MediaMTX API를 `127.0.0.1`로, 비밀번호 `infra/.env`
- 의존성 (개발 의존성 포함): 백엔드·Vite 템플릿 **0건**, 프론트 77건 → 2건 (Vite 6.4.6 등, v2와 같은 버전)

## v1에만 있던 것

| 대상 | 문제 | 수정 |
|---|---|---|
| `POST /chat` (AI 어시스턴트) | 누구나 호출 가능 → **Claude API 키로 비용 발생**, 도구로 위반 일괄 처리 가능 | 관리자 전용 + 메시지 최대 20개·2000자·role 검증 |
| `GET /debug/spots`, `/debug/cameras` | 인증 없음 | 관리자 전용 |
| `POST /ai/events` | 누구나 **가짜 감지 이벤트를 주입** 가능 | 관리자 전용 + payload 외 필드 원시값 검증 |
| `GET /violations/:id` | 인증 없음 | 관리자 전용 |
| `app.js` + `routes/dashboard.js` (예전 서버) | 인증 없음, 에러 메시지 노출 | `/api` 전체 관리자 전용, 에러 메시지 숨김 |
| `functions/rtsp-stream-proxy` | 토큰이 비어 있으면 SDK가 에러 없이 `undefined`를 돌려줘서 **로그인 없이 카메라 정보 조회·수정** 가능 | 토큰·사용자 확인 + 관리자 전용, 에러 메시지 숨김 |
| `ai/main.py --server` (Flask) | `0.0.0.0:5001`에 인증 없이 카메라 시작·중지 API | 기본 `127.0.0.1`. 외부에 열려면 `AI_SERVER_HOST` + 16자 이상 `AI_CONTROL_TOKEN` 필수 (`X-AI-Token` 헤더) |
| `@anthropic-ai/sdk` 0.85 | 취약점 (moderate) | 1.13으로 업데이트 (`messages.create` 호환 확인) |
| 개인정보 | `.vscode/tasks.json`, `ai/draw_zones.py`에 개발 PC 사용자명이 든 절대경로, `docs/작품요약서.pdf` 캡처 이미지에 로그인 아이디 | 상대경로로 변경, 캡처의 아이디를 데모 이름으로 교체 (v1·v2 공통) |

검증: 격리된 MySQL과 가짜 Lumi 서버로 v2와 같은 50개 항목 + v1 전용 18개 항목 테스트 → 모두 통과 (`app.js`의 `zone[zone]=1`은 `simple` 쿼리 파서 때문에 객체가 되지 않아 필터 없는 결과와 같음을 확인).

> 참고: `infra/mediamtx.yml`의 `runOnReady` 훅은 AI Flask 서버(5001)를 부르는데, 이제 Flask가 기본으로 이 PC에서만 열리고 MediaMTX 기본 이미지에는 `curl`도 없어서 훅은 동작하지 않습니다. 발표 당시에도 AI는 `python main.py`(플래그 없음)로 실행했습니다.
