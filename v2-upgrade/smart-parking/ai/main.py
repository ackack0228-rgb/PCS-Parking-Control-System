"""
main.py  ─ AI 서비스 진입점
────────────────────────────────────────────────────────────
실행:
    python main.py

동작:
    1. MJPEG 서버(포트 8090) 시작 → 관리자 CCTV 화면에서 실시간 영상 확인
    2. StreamWorker 시작 → .env의 CAMERA_SOURCE에서 프레임을 읽어
       구역별 점유 여부를 판정하고 RabbitMQ로 이벤트 발행

주의:
    주차칸을 비운 상태에서 시작하고, 40초 워밍업(배경 학습) 후 차를 올린다.
────────────────────────────────────────────────────────────
"""

import signal
import sys
import time

import config
from camera.stream_worker import StreamWorker
from streaming import mjpeg_server

MJPEG_PORT = 8090


def main():
    print("[AI] AI 서비스 시작")
    print(f"   카메라 코드 : {config.CAMERA_CODE}")
    print(f"   카메라 소스 : {config.CAMERA_SOURCE}")
    print(f"   서버 IP     : {config.SERVER_IP}")
    print(f"   분석 주기   : {config.FRAME_INTERVAL}초마다")
    print("Ctrl+C 로 종료\n")

    mjpeg_server.start(port=MJPEG_PORT)

    worker = StreamWorker()
    worker.start()

    def _shutdown(sig, frame):
        print("\n종료 중...")
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # 워커는 데몬 스레드이므로 메인 스레드는 대기만 한다.
    # (Windows에는 signal.pause가 없어 sleep 루프로 대체)
    if hasattr(signal, "pause"):
        signal.pause()
    else:
        while True:
            time.sleep(1)


if __name__ == "__main__":
    main()
