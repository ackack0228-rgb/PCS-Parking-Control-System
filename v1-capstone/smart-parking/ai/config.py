"""
config.py
- 환경 변수를 한 곳에서 관리
- 카메라 장치(.env)와 메인 서버 IP를 분리해서 설정한다.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── 메인 서버 IP ──────────────────────────────────────────
# 카메라 장치에서 메인 노트북(서버)으로 연결할 IP
# 같은 와이파이라면 메인 노트북의 내부 IP (예: 192.168.0.10)
SERVER_IP = os.getenv("SERVER_IP", "localhost")

# ── RabbitMQ (메인 서버에서 실행 중) ─────────────────────
RABBIT_URL   = os.getenv("RABBIT_URL",   f"amqp://app:apppass@{SERVER_IP}:5672")
RABBIT_QUEUE = os.getenv("RABBIT_QUEUE", "ai.events")

# ── MediaMTX (메인 서버에서 실행 중, CCTV 대시보드용) ─────
MEDIAMTX_HOST      = os.getenv("MEDIAMTX_HOST",      SERVER_IP)
MEDIAMTX_RTSP_PORT = int(os.getenv("MEDIAMTX_RTSP_PORT", 8554))

# ── 카메라 소스 ───────────────────────────────────────────
# "0"         → 로컬 웹캠 (USB 카메라, 노트북 카메라)
# "/dev/video0" → 라즈베리파이 카메라
# "rtsp://..."  → 외부 RTSP 스트림
CAMERA_SOURCE = os.getenv("CAMERA_SOURCE", "0")

# 카메라 식별 코드 (대시보드에서 보여줄 이름)
CAMERA_CODE   = os.getenv("CAMERA_CODE",   "CAM-A-G-01")
DEVICE_CODE   = os.getenv("DEVICE_CODE",   CAMERA_CODE)

# ── YOLOv8 모델 ───────────────────────────────────────────
YOLO_MODEL = os.getenv("YOLO_MODEL", "yolov8n.pt")

# ── 분석 설정 ─────────────────────────────────────────────
FRAME_INTERVAL       = float(os.getenv("FRAME_INTERVAL",       "1.0"))
CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.5"))

# 구역에서 차량이 N초 동안 감지되지 않으면 "차량 떠남" 이벤트 발행
# Jetson 사용 시 FRAME_INTERVAL을 0.5로 낮추면 이 값도 5~10초 정도로 조정 권장
SPOT_CLEAR_TIMEOUT   = float(os.getenv("SPOT_CLEAR_TIMEOUT",   "10.0"))
