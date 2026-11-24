"""
streaming/mjpeg_server.py
- 최신 카메라 프레임을 MJPEG HTTP 스트림으로 제공한다.
- stream_worker.py가 update_frame()을 호출해 프레임을 공유한다.
- 브라우저에서 <img src="http://IP:8090/stream?token=..."> 으로 재생한다.

보안:
- 같은 PC(127.0.0.1)에서 오는 요청은 토큰 없이 허용한다 (로컬 확인용 /snapshot 등).
- 다른 기기에서 오는 요청은 ?token=<Lumi 로그인 토큰> 이 필요하고,
  백엔드 GET /auth/me 로 확인해서 관리자(ADMIN)일 때만 영상을 보낸다. (결과 60초 캐시)
- MJPEG_AUTH=off 로 끌 수 있다 (권장하지 않음).
"""

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import cv2
import numpy as np

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:4000").rstrip("/")
AUTH_ENABLED = os.getenv("MJPEG_AUTH", "on").lower() != "off"
MAX_STREAM_CLIENTS = 5          # 동시 시청자 수 제한 (자원 고갈 방지)
TOKEN_TTL_SEC = 60
LOCAL_ADDRS = {"127.0.0.1", "::1"}

_latest_frame: np.ndarray | None = None
_lock = threading.Lock()

_stream_clients = 0
_clients_lock = threading.Lock()

_token_cache: dict[str, float] = {}   # token → 만료 시각 (ADMIN 확인된 토큰만)
_token_lock = threading.Lock()


def update_frame(frame: np.ndarray) -> None:
    global _latest_frame
    with _lock:
        _latest_frame = frame.copy()


def _get_frame() -> np.ndarray | None:
    with _lock:
        return _latest_frame


def _is_admin_token(token: str) -> bool:
    """백엔드 /auth/me 로 토큰을 확인해 ADMIN 이면 True."""
    if not token or len(token) > 4096:
        return False
    now = time.time()
    with _token_lock:
        exp = _token_cache.get(token)
        if exp and exp > now:
            return True

    req = urllib.request.Request(
        f"{BACKEND_URL}/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            ok = r.status == 200 and json.loads(r.read().decode()).get("userRole") == "ADMIN"
    except (urllib.error.URLError, ValueError, OSError):
        ok = False

    if ok:
        with _token_lock:
            if len(_token_cache) > 200:
                _token_cache.clear()
            _token_cache[token] = now + TOKEN_TTL_SEC
    return ok


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass  # 로그 억제

    def _authorized(self, query: dict) -> bool:
        if not AUTH_ENABLED or self.client_address[0] in LOCAL_ADDRS:
            return True
        token = (query.get("token") or [""])[0]
        return _is_admin_token(token)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path not in ("/stream", "/snapshot"):
            self.send_response(404)
            self.end_headers()
            return
        if not self._authorized(urllib.parse.parse_qs(url.query)):
            self.send_response(401)
            self.end_headers()
            return
        if url.path == "/stream":
            self._serve_mjpeg()
        else:
            self._serve_snapshot()

    def _serve_mjpeg(self):
        global _stream_clients
        with _clients_lock:
            if _stream_clients >= MAX_STREAM_CLIENTS:
                self.send_response(503)
                self.end_headers()
                return
            _stream_clients += 1

        try:
            self.send_response(200)
            self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()

            while True:
                frame = _get_frame()
                if frame is None:
                    time.sleep(0.05)
                    continue

                ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if not ok:
                    continue

                data = jpg.tobytes()
                self.wfile.write(b"--frame\r\n")
                self.wfile.write(b"Content-Type: image/jpeg\r\n")
                self.wfile.write(f"Content-Length: {len(data)}\r\n".encode())
                self.wfile.write(b"\r\n")
                self.wfile.write(data)
                self.wfile.write(b"\r\n")
                self.wfile.flush()

                time.sleep(0.067)  # ~15 fps
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with _clients_lock:
                _stream_clients -= 1

    def _serve_snapshot(self):
        frame = _get_frame()
        if frame is None:
            self.send_response(503)
            self.end_headers()
            return
        ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ok:
            self.send_response(500)
            self.end_headers()
            return
        data = jpg.tobytes()
        self.send_response(200)
        self.send_header("Content-Type", "image/jpeg")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def start(port: int = 8090) -> None:
    """MJPEG 서버를 데몬 스레드로 시작한다. (요청마다 스레드 → 여러 명이 동시에 시청 가능)"""
    server = ThreadingHTTPServer(("0.0.0.0", port), _Handler)
    server.daemon_threads = True
    t = threading.Thread(target=server.serve_forever, daemon=True, name="mjpeg-server")
    t.start()
    auth = "관리자 토큰 필요 (같은 PC는 예외)" if AUTH_ENABLED else "인증 꺼짐 (MJPEG_AUTH=off)"
    print(f"[MJPEG] 스트림 서버 시작: http://0.0.0.0:{port}/stream | {auth}")
