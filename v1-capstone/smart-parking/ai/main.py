"""
main.py  ─ AI 서비스 진입점
────────────────────────────────────────────────────────────

실행 방법 2가지:

  [방법 1] 단독 실행 (카메라 장치에서 권장)
    python main.py
    → .env의 CAMERA_SOURCE, CAMERA_CODE 설정으로 바로 분석 시작

  [방법 2] API 서버 모드 (MediaMTX 훅 연동 시)
    python main.py --server
    → Flask 서버(포트 5001)를 띄워서 외부에서 시작/중지 제어 가능
    → POST /stream/start, POST /stream/stop

────────────────────────────────────────────────────────────
"""

import argparse
import signal
import sys

import config
from camera.stream_worker import StreamWorker
from streaming import mjpeg_server


# ── 방법 1: 단독 실행 ────────────────────────────────────

def run_standalone():
    """카메라 한 대를 바로 시작하는 단순 모드."""
    print("[AI] AI 서비스 시작 (단독 모드)")
    print(f"   카메라 코드 : {config.CAMERA_CODE}")
    print(f"   카메라 소스 : {config.CAMERA_SOURCE}")
    print(f"   서버 IP     : {config.SERVER_IP}")
    print(f"   분석 주기   : {config.FRAME_INTERVAL}초마다")
    print("Ctrl+C 로 종료\n")

    mjpeg_server.start(port=8090)

    worker = StreamWorker()
    worker.start()

    # Ctrl+C 처리
    def _shutdown(sig, frame):
        print("\n종료 중...")
        worker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # 메인 스레드는 대기 (워커는 데몬 스레드)
    signal.pause() if hasattr(signal, "pause") else _wait_forever()


def _wait_forever():
    import time
    while True:
        time.sleep(1)


# ── 방법 2: API 서버 모드 (Flask) ────────────────────────

def run_server():
    """Flask API 서버 모드 (MediaMTX runOnPublish 훅 연동용)."""
    import hmac
    import os

    from flask import Flask, request, jsonify

    # 보안: 기본은 이 PC(127.0.0.1)에서만 접속 가능.
    # 다른 기기에 열려면 AI_SERVER_HOST=0.0.0.0 과 함께 AI_CONTROL_TOKEN 을 반드시 설정해야 한다.
    host = os.getenv("AI_SERVER_HOST", "127.0.0.1")
    control_token = os.getenv("AI_CONTROL_TOKEN", "")
    if host not in ("127.0.0.1", "localhost", "::1") and len(control_token) < 16:
        print("[AI] 보안: AI_SERVER_HOST를 외부에 열려면 16자 이상의 AI_CONTROL_TOKEN이 필요합니다. 종료합니다.")
        sys.exit(1)

    app = Flask(__name__)
    workers: dict[str, StreamWorker] = {}

    @app.before_request
    def _check_token():
        # 토큰을 설정했다면 /health 를 뺀 모든 요청에 X-AI-Token 헤더가 필요하다
        if control_token and request.path != "/health":
            sent = request.headers.get("X-AI-Token", "")
            if not hmac.compare_digest(sent, control_token):
                return jsonify({"ok": False, "message": "unauthorized"}), 401
        return None

    @app.route("/stream/start", methods=["POST"])
    def stream_start():
        body        = request.get_json(silent=True) or {}
        camera_code = body.get("camera_id") or body.get("camera_code")
        device_code = body.get("device_code") or camera_code

        if not camera_code:
            return jsonify({"ok": False, "message": "camera_id is required"}), 400

        if camera_code in workers and workers[camera_code].is_running():
            return jsonify({"ok": True, "message": f"{camera_code} 이미 실행 중"})

        worker = StreamWorker(camera_code=camera_code, device_code=device_code)
        workers[camera_code] = worker
        worker.start()
        return jsonify({"ok": True, "camera_code": camera_code, "message": "시작됨"})

    @app.route("/stream/stop", methods=["POST"])
    def stream_stop():
        body        = request.get_json(silent=True) or {}
        camera_code = body.get("camera_id") or body.get("camera_code")

        if not camera_code:
            return jsonify({"ok": False, "message": "camera_id is required"}), 400

        worker = workers.pop(camera_code, None)
        if not worker:
            return jsonify({"ok": False, "message": f"{camera_code} 실행 중이 아님"}), 404

        worker.stop()
        return jsonify({"ok": True, "camera_code": camera_code, "message": "중지됨"})

    @app.route("/status", methods=["GET"])
    def status():
        return jsonify({
            "ok":             True,
            "active_cameras": list(workers.keys()),
            "count":          len(workers),
        })

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"ok": True, "service": "ai-service"})

    print(f"[AI] AI 서비스 시작 (API 서버 모드) | http://{host}:5001 | 토큰 {'필요' if control_token else '없음(로컬 전용)'}")
    app.run(host=host, port=5001, debug=False)


# ── 진입점 ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI 주차 탐지 서비스")
    parser.add_argument(
        "--server", action="store_true",
        help="Flask API 서버 모드로 실행 (기본: 단독 실행)"
    )
    args = parser.parse_args()

    if args.server:
        run_server()
    else:
        run_standalone()
