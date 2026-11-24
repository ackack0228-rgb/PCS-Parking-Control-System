# 스마트 주차 시스템 - 진행 현황

## 프로젝트 목표
주차장 카메라 영상을 AI로 실시간 분석해 불법 주차 차량을 자동 탐지하고,
관리자 대시보드에서 확인할 수 있는 시스템 구축.

---

## 전체 아키텍처

```
[라즈베리파이]                         [메인 노트북]
  USB 웹캠
    ↓
  Python AI 서비스
  - OpenCV 프레임 추출
  - YOLOv8 차량 탐지          →→→    RabbitMQ (:5672)
  - RabbitMQ로 이벤트 발행             ↓
                                     consumer.js
                                       ↓
                                     MySQL (:3306)
                                       ↓
                               Backend API (:4000)
                                       ↓
                               Frontend 대시보드 (:5173)
```

---

## 폴더 구조

```
smart-parking/
├── backend/
│   ├── index.js        ← Express API 서버 (포트 4000)
│   ├── consumer.js     ← RabbitMQ 소비자 → MySQL 저장
│   ├── db.js           ← MySQL 커넥션 풀
│   └── routes/
│       └── dashboard.js ← API 라우트
├── ai/
│   ├── main.py         ← 진입점 (단독 실행 or API 서버 모드)
│   ├── config.py       ← 환경 변수 관리
│   ├── camera/
│   │   ├── pi_camera.py      ← Pi/USB 웹캠 핸들러
│   │   └── stream_worker.py  ← RTSP 스트림 스레드
│   ├── detection/
│   │   ├── detector.py       ← YOLOv8 차량 탐지
│   │   └── export_onnx.py    ← ONNX 변환 (속도 향상)
│   ├── messaging/
│   │   └── publisher.py      ← RabbitMQ 발행
│   ├── test_stream.py        ← 탐지 테스트 스크립트
│   ├── requirements.txt      ← 일반 PC용
│   ├── requirements_pi.txt   ← 라즈베리파이용
│   ├── setup_pi.sh           ← Pi 초기 설치 스크립트
│   └── .env.pi.example       ← Pi 환경 변수 예시
├── db/
│   ├── schema.sql      ← DB 테이블 정의
│   └── seed.sql        ← 초기 데이터
└── infra/
    └── docker-compose.yml  ← MySQL + RabbitMQ + Adminer

Resident and Admin Dashboard/   ← 프론트엔드 (별도 폴더)
├── src/
│   ├── pages/admin/    ← 관리자 페이지
│   ├── pages/resident/ ← 입주민 페이지
│   └── lib/api.ts      ← 백엔드 API 호출
```

---

## 실행 방법

### 메인 노트북

```bash
# 1. Docker 서비스 (MySQL + RabbitMQ + Adminer)
cd smart-parking/infra
docker-compose up -d

# 2. 백엔드 서버
cd smart-parking/backend
node index.js

# 3. RabbitMQ 소비자 (AI 이벤트 처리)
cd smart-parking/backend
node consumer.js

# 4. 프론트엔드 (VS Code에서 폴더 열면 자동 실행)
cd "Resident and Admin Dashboard"
npm run dev
```

### 라즈베리파이 (처음 한 번만)

```bash
cd ~/ai
bash setup_pi.sh        # 패키지 설치
cp .env.pi.example .env
nano .env               # SERVER_IP=메인노트북IP 수정
```

### 라즈베리파이 (매번 실행)

```bash
cd ~/ai
source venv/bin/activate
python main.py
```

---

## 접속 주소

| 서비스 | 주소 | 계정 |
|--------|------|------|
| 대시보드 (관리자) | http://localhost:5173/admin | - |
| 대시보드 (입주민) | http://localhost:5173/resident | - |
| DB 뷰어 (Adminer) | http://localhost:8080 | 서버: mysql / ID: app / PW: apppass |
| 백엔드 헬스체크 | http://localhost:4000/health | - |
| RabbitMQ 관리 | http://localhost:15672 | app / apppass |

---

## 주요 API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /health | 서버 상태 확인 |
| POST | /ai/events | AI 이벤트 수신 |
| GET | /violations/open | 미처리 위반 목록 |
| GET | /violations/:id | 위반 상세 |
| POST | /violations/:id/resolve | 위반 처리 완료 |
| GET | /spots/forbidden-occupied | 금지구역 점유 현황 |
| GET | /debug/spots | 주차면 목록 |
| GET | /debug/cameras | 카메라 목록 |

---

## AI 서비스 RabbitMQ 메시지 형식

consumer.js가 기대하는 필드:

```json
{
  "event_id":        "uuid",
  "event_type_code": "spot_status",
  "camera_code":     "CAM-A-G-01",
  "device_code":     "CAM-A-G-01",
  "camera_role":     "parking_view",
  "ts":              "2024-01-01T00:00:00.000Z",
  "spot_id":         null,
  "plate_text":      null,
  "confidence":      0.91,
  "image_ref":       null,
  "payload": {
    "class":  "car",
    "bbox":   [x1, y1, x2, y2],
    "center": [cx, cy]
  }
}
```

---

## 완료된 단계

- [x] **1단계**: AI 서비스 기본 구조 (Flask + OpenCV + YOLOv8 + RabbitMQ)
- [x] **2단계**: RTSP/웹캠 프레임 추출 및 차량 탐지 테스트 스크립트
- [x] **3단계**: 주차 구역 폴리곤 정의 → 불법 주차 판단
- [x] **4단계**: MediaMTX 자동 연동 (카메라 연결 시 AI 자동 시작)
- [x] **5단계**: 대시보드 실시간 위반 표시

---

## 환경 변수 (.env 위치별)

### smart-parking/backend/.env
```
PORT=4000
DB_HOST=localhost
DB_PORT=3306
DB_USER=app
DB_PASSWORD=apppass
DB_NAME=smartparking
RABBIT_URL=amqp://app:apppass@localhost:5672
RABBIT_QUEUE=ai.events
```

### smart-parking/ai/.env (라즈베리파이)
```
SERVER_IP=192.168.0.XX    ← 메인 노트북 IP
CAMERA_SOURCE=0
CAMERA_CODE=CAM-A-G-01
DEVICE_CODE=CAM-A-G-01
YOLO_MODEL=yolov8n.pt
FRAME_INTERVAL=3.0
CONFIDENCE_THRESHOLD=0.5
```

### Resident and Admin Dashboard/.env
```
VITE_BACKEND_URL=http://localhost:4000
VITE_USE_DENO_PROXY=false
```
