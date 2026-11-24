# PCS — Parking Control System (Backend · AI · Infra)

AI 카메라 기반 **아파트 스마트 주차 관리 시스템**의 서버 쪽 코드입니다.
카메라 영상으로 주차칸 점유를 판정하고, 이벤트를 메시지 큐로 받아 MySQL에 쌓은 뒤 REST API로 대시보드에 제공합니다.

> 웹 대시보드(관리자·입주민 화면)는 같은 상위 폴더의 [`../Resident and Admin Dashboard`](<../Resident and Admin Dashboard>)에 있습니다.

## 구성

| 폴더 | 내용 | 기술 |
|---|---|---|
| `ai/` | 카메라 프레임 → 구역별 점유 판정 → RabbitMQ 발행, MJPEG 스트림(:8090) | Python, OpenCV (MOG2 배경 차분), pika |
| `backend/` | `index.js`: REST API·SSE(:4000), `consumer.js`: 이벤트 → DB 저장 | Node.js, Express 4, mysql2, amqplib |
| `db/` | `schema.sql`, `seed.sql`, `demo-seed.sql` | MySQL 8 |
| `infra/` | `docker-compose.yml`, `mediamtx.yml` | MySQL, RabbitMQ, MediaMTX, Adminer |

## 핵심 기능

- **주차칸 점유 감지**: 구역 폴리곤마다 배경 차분 비율을 계산하고, 연속 5프레임(`DEBOUNCE_FRAMES`, 구역별로 조정 가능) 동안 임계값을 넘으면 점유로 확정합니다 (디바운스).
- **불법주차 감지**: 금지구역 점유와 이중주차(세션 없이 점유된 칸)를 감지합니다.
- **색깔 기반 입출차 세션**: `pending` → AI가 칸을 확정하면 `parked` → 출차하면 `exited`, 완료된 세션은 이력으로 보관합니다.
- **선호 주차칸 분석**: 세션 이력과 AI 감지 로그를 합산해 차량별 TOP 5를 구하고, 각 칸이 지금 비어있는지 함께 알려줍니다.
- **입주민 알림**: 입차 시 빈자리와 선호칸을, 출차 시 해당 칸을 선호하는 입주민에게 알립니다 (인메모리).

## 실행

> **가장 쉬운 방법**: `../Resident and Admin Dashboard` 폴더를 VSCode로 열면 아래 1·3·4단계와 프론트엔드가 자동으로 시작됩니다. (DB 초기화 2단계는 처음 한 번 직접 실행)

```bash
# 1) 인프라 (MySQL, RabbitMQ, MediaMTX, Adminer)
cd infra && docker-compose up -d

# 2) DB 초기화 (처음 한 번). 한글 번호판 때문에 utf8mb4 옵션이 꼭 필요합니다
docker exec -i smartparking-mysql mysql --default-character-set=utf8mb4 -uapp -papppass smartparking < ../db/schema.sql
docker exec -i smartparking-mysql mysql --default-character-set=utf8mb4 -uapp -papppass smartparking < ../db/seed.sql
docker exec -i smartparking-mysql mysql --default-character-set=utf8mb4 -uapp -papppass smartparking < ../db/demo-seed.sql

# 3) 백엔드
cd ../backend && npm install && cp .env.example .env
npm start               # API 서버 :4000  →  curl localhost:4000/health  (나머지 API는 Lumi 로그인 토큰 필요)
npm run consumer        # RabbitMQ consumer (다른 터미널)
npm run test:event      # (선택) 카메라 없이 테스트 이벤트 발행

# 4) AI 서비스
cd ../ai && python -m venv venv && venv/Scripts/activate   # Linux: source venv/bin/activate
pip install -r requirements.txt                            # Jetson: requirements_jetson.txt
#   (선택) YOLO 확장 모듈까지 쓰려면: pip install -r requirements-yolo.txt  ← PyTorch 포함, 수 GB
cp .env.example .env
python main.py
```

> **AI 시작 순서**: 주차칸을 비운 채 `main.py`를 시작하고 → 40초 워밍업(배경 학습)을 기다린 뒤 → 차를 올리세요.
> 구역 좌표는 `python calibrate_zones.py`로 측정해서 `ai/detection/zones.py`에 넣습니다.

| 포트 | 서비스 |
|---|---|
| 4000 | 백엔드 API |
| 3306 | MySQL (`app` / `apppass`, DB `smartparking`) |
| 5672 / 15672 | RabbitMQ / 관리 UI |
| 8554 / 8888 / 8889 | MediaMTX RTSP / API / HLS |
| 8080 | Adminer (DB 웹 UI) |
| 8090 | AI MJPEG 스트림 (`/stream`, `/snapshot`) |

## 보안

- 백엔드 API는 `/health`를 빼고 Lumi 로그인 토큰을 검증하고(`backend/security.js`), 관리자 전용과 본인 데이터만 허용하는 API를 나눠요.
- MySQL·Adminer·RabbitMQ 관리 화면은 이 PC(`127.0.0.1`)에서만 열려요. 비밀번호는 `infra/.env`로 바꿀 수 있어요 (`infra/.env.example`).
- 자세한 내용: [../SECURITY.md](../SECURITY.md)

## 문서

- [코드 구조 (ARCHITECTURE.md)](docs/ARCHITECTURE.md): 데이터 흐름, 모듈 구조, API 목록, DB 테이블
