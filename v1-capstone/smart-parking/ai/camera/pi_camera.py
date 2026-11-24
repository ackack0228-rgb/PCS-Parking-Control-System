"""
camera/pi_camera.py
────────────────────────────────────────────────────────────
라즈베리파이 카메라를 추상화한다.

지원하는 카메라:
  1) Pi Camera Module v2/v3 (CSI 포트 연결)
     - Raspberry Pi OS Bullseye 이상에서는 /dev/video0 으로 잡힘
     - 안 잡히면 picamera2 라이브러리로 폴백

  2) USB 웹캠
     - /dev/video0 또는 /dev/video1 등으로 잡힘

사용법:
  cam = PiCameraCapture()
  if cam.isOpened():
      ret, frame = cam.read()   # OpenCV BGR 프레임 반환
  cam.release()
"""

import cv2
import numpy as np

# picamera2는 Pi에서만 설치되므로 import 실패를 안전하게 처리
try:
    from picamera2 import Picamera2
    PICAMERA2_AVAILABLE = True
except ImportError:
    PICAMERA2_AVAILABLE = False


class PiCameraCapture:
    """
    Pi Camera Module과 USB 웹캠을 통합해서 다루는 클래스.
    OpenCV VideoCapture와 동일한 인터페이스(read, isOpened, release)를 제공한다.
    """

    def __init__(self, source, width: int = 640, height: int = 480):
        """
        source:
          0, 1 ... → USB 웹캠 or V4L2 장치 인덱스
          "/dev/video0" → 장치 경로
          "picamera2"   → Pi Camera Module (picamera2 라이브러리 직접 사용)
        """
        self._source   = source
        self._width    = width
        self._height   = height
        self._backend  = None   # "v4l2" or "picamera2"
        self._cap      = None   # cv2.VideoCapture 인스턴스
        self._picam    = None   # Picamera2 인스턴스
        self._opened   = False

        self._open()

    # ── 초기화 ───────────────────────────────────────────

    def _open(self):
        if str(self._source) == "picamera2":
            self._open_picamera2()
        else:
            # V4L2(VideoCapture)로 먼저 시도 → 실패하면 picamera2 폴백
            success = self._open_v4l2()
            if not success and PICAMERA2_AVAILABLE:
                print("[PiCamera] V4L2 실패 → picamera2로 폴백")
                self._open_picamera2()

    def _open_v4l2(self) -> bool:
        """OpenCV VideoCapture로 카메라를 연다."""
        import sys, time
        src = int(self._source) if str(self._source).lstrip("-").isdigit() else self._source

        # Windows는 CAP_V4L2 미지원 → 기본 백엔드(MSMF) 사용
        if sys.platform == "win32":
            cap = cv2.VideoCapture(src)
        else:
            cap = cv2.VideoCapture(src, cv2.CAP_V4L2)

        if not cap.isOpened():
            cap.release()
            return False

        cap.set(cv2.CAP_PROP_FRAME_WIDTH,  self._width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        # Windows MSMF: 초기화 대기 후 프레임이 나올 때까지 최대 5초 재시도
        if sys.platform == "win32":
            time.sleep(2)
            ok = False
            for _ in range(50):
                ret, _ = cap.read()
                if ret:
                    ok = True
                    break
                time.sleep(0.1)
            if not ok:
                cap.release()
                return False

        self._cap     = cap
        self._backend = "v4l2"
        self._opened  = True
        print(f"[PiCamera] 카메라 연결 성공 (소스: {src})")
        return True

    def _open_picamera2(self):
        """picamera2로 Pi Camera Module을 연다."""
        if not PICAMERA2_AVAILABLE:
            print("[PiCamera] picamera2가 설치되어 있지 않습니다.")
            print("  → sudo apt install -y python3-picamera2")
            return

        try:
            picam = Picamera2()
            cfg   = picam.create_preview_configuration(
                main={"size": (self._width, self._height), "format": "RGB888"}
            )
            picam.configure(cfg)
            picam.start()

            self._picam   = picam
            self._backend = "picamera2"
            self._opened  = True
            print("[PiCamera] picamera2 연결 성공")
        except Exception as e:
            print(f"[PiCamera] picamera2 연결 실패: {e}")

    # ── VideoCapture 호환 인터페이스 ─────────────────────

    def isOpened(self) -> bool:
        return self._opened

    def read(self):
        """(ret: bool, frame: np.ndarray) 튜플을 반환한다."""
        if not self._opened:
            return False, None

        if self._backend == "v4l2":
            return self._cap.read()

        if self._backend == "picamera2":
            try:
                # picamera2는 RGB → OpenCV용 BGR로 변환
                frame_rgb = self._picam.capture_array()
                frame_bgr = frame_rgb[:, :, ::-1].copy()
                return True, frame_bgr
            except Exception as e:
                print(f"[PiCamera] 프레임 읽기 오류: {e}")
                return False, None

        return False, None

    def release(self):
        if self._cap:
            self._cap.release()
        if self._picam:
            self._picam.stop()
        self._opened = False
        print("[PiCamera] 카메라 해제")
