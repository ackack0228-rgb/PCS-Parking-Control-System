# v2 — 업그레이드 버전

캡스톤 버전([`../v1-capstone`](../v1-capstone))에서 동작하지 않는 더미 코드를 걷어내고, 코드를 최적화하고, 구조 문서를 더한 버전입니다. 기능은 v1과 같습니다.

```
v2-upgrade/
├── Resident and Admin Dashboard/   🖥️ 프론트엔드 (:5173)
└── smart-parking/
    ├── backend/   ⚙️ API 서버 (:4000) + RabbitMQ consumer
    ├── ai/        🤖 AI 서버 (MJPEG :8090)
    ├── db/        MySQL 스키마·시드
    └── infra/     Docker Compose (MySQL, RabbitMQ, MediaMTX, Adminer)
```

| 폴더 | 실행 가이드 | 코드 구조 |
|---|---|---|
| 🖥️ Resident and Admin Dashboard | [README](<Resident and Admin Dashboard/README.md>) | [ARCHITECTURE](<Resident and Admin Dashboard/docs/ARCHITECTURE.md>) |
| ⚙️🤖 smart-parking | [README](smart-parking/README.md) | [ARCHITECTURE](smart-parking/docs/ARCHITECTURE.md) |

🔒 **보안**: [SECURITY.md](SECURITY.md). 인증·권한 구조, 점검 결과, 남은 위험, 운영 체크리스트가 들어 있어요.

## 빠른 시작

**준비물**: Docker Desktop, Node.js 18+, pnpm, Python 3.10+, 웹캠 (AI 서버용)

```bash
git clone https://github.com/ackack0228-rgb/PCS-Parking-Control-System.git
cd PCS-Parking-Control-System/v2-upgrade/smart-parking

# 1) 인프라 + DB 초기화 (처음 한 번)
cd infra && docker-compose up -d && cd ..
for f in schema seed demo-seed; do
  docker exec -i smartparking-mysql mysql --default-character-set=utf8mb4 -uapp -papppass smartparking < db/$f.sql
done

# 2) 의존성 + 설정 파일 (처음 한 번)
(cd backend && npm install && cp .env.example .env)
(cd ai && python -m venv venv && venv/Scripts/pip install -r requirements.txt && cp .env.example .env)   # Linux/macOS: venv/bin/pip
(cd "../Resident and Admin Dashboard" && pnpm install && cp .env.example .env)
```

그다음 **`Resident and Admin Dashboard` 폴더를 VSCode로 열면** Docker → 백엔드 → consumer → AI → 프론트가 자동으로 시작됩니다 (Windows).
직접 실행하는 방법은 [smart-parking/README.md](smart-parking/README.md)에 있어요. 브라우저에서 http://localhost:5173 을 열면 됩니다.

> **AI 시작 순서**: 주차칸을 비운 채 AI 서버를 시작 → 40초 워밍업(배경 학습) → 주차 제어 화면에서 입차 버튼 → 8초 뒤 차를 올리기.
> 구역 좌표는 `smart-parking/ai`에서 `python calibrate_zones.py`로 측정해 `detection/zones.py`에 넣습니다.

### 알아둘 점
- **로그인**은 Lumi 인증을 씁니다. 관리자 화면은 `ADMIN`, 입주민 화면은 `USER` 역할 계정이 필요하고, 역할은 Lumi 프로젝트 소유자가 부여합니다.
- 백엔드 API는 `/health`만 빼고 **Lumi 로그인 토큰이 필요**합니다. 대시보드가 자동으로 붙여 보내고, 입주민은 본인 데이터만 볼 수 있어요. 동작 확인은 `curl localhost:4000/health`, 카메라 없이 테스트 이벤트를 보내려면 `smart-parking/backend`에서 `npm run test:event`를 실행하세요 (RabbitMQ 경유라 토큰 불필요).
- 대시보드를 `localhost`·`192.168.137.1`이 아닌 주소로 열면 `smart-parking/backend/.env`의 `CORS_ORIGINS`에 그 주소를 추가하세요.
- 구역 폴리곤(`zones.py`)은 발표용 모형에 맞춰져 있어서, 다른 카메라 화면에서는 다시 측정해야 합니다.

## v1 대비 정리 내용

- **프론트엔드**: 구버전 페이지(AdminOverview, AdminUsers), 호출처 없는 API 함수, 데이터가 없어 동작하지 않던 Lumi fallback, 참조 없는 Lumi 엔티티 10개, 쓰지 않는 Deno 함수, 일회성 스크립트 삭제. VSCode 태스크를 상대경로로, `.env.example`을 실제 변수로 교체, lockfile 동기화
- **백엔드**: `index.js` 1353줄 → 874줄. AI 채팅(`/chat`)과 Anthropic SDK, 존재하지 않는 테이블을 조회하던 `/debug/*`, 호출처 없는 `/ai/events`·`GET /violations/:id` 삭제. 구버전 서버(app.js, routes/, db.js) 삭제. API 키 없이 실행 가능. 데모 시드에서 A1-001이 이중주차로 잡히던 문제 수정
- **보안**: API 인증·권한, 쿼리 객체 주입 차단, Docker 포트 제한, 의존성 취약점 해결, CORS 허용 목록, AI 영상 인증 ([SECURITY.md](SECURITY.md))
- **AI 서버**: 쓰지 않는 Flask `--server` 모드와 MediaMTX 자동 시작 훅, 디버그 스크립트, 라즈베리파이 파일 삭제. `.env.example`을 같은 PC 실행 기준(`localhost`, `CAM-GATE-01`)으로 수정. YOLO는 `requirements-yolo.txt`로 분리
