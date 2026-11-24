"""
camera/stream_worker.py
- PiCameraCapture로 웹캠 프레임을 읽고 구역 점유 감지 → 이벤트 발행한다.
- 배경 차분법(ZoneOccupancyDetector)으로 점유 여부를 판별한다.
  장난감 차, 블록 등 실제 차가 아닌 물체도 감지할 수 있다.
"""

import gc
import sys
import threading
import time
import uuid
from datetime import datetime, timezone

import config
from camera.pi_camera import PiCameraCapture
from detection.zone_occupancy import ZoneOccupancyDetector
from messaging.publisher import RabbitPublisher
from streaming import mjpeg_server


HEARTBEAT_INTERVAL = 30  # 초: 이 주기로 heartbeat 이벤트 발행


class StreamWorker:
    def __init__(self, camera_code: str = None, device_code: str = None):
        self.camera_code = camera_code or config.CAMERA_CODE
        self.device_code = device_code or config.DEVICE_CODE
        self.source      = config.CAMERA_SOURCE

        self._stop_event = threading.Event()
        self._thread     = threading.Thread(
            target=self._run, daemon=True, name=f"worker-{self.camera_code}"
        )
        self._heartbeat_thread = threading.Thread(
            target=self._run_heartbeat, daemon=True, name=f"heartbeat-{self.camera_code}"
        )
        self.detector  = ZoneOccupancyDetector(camera_code=self.camera_code)
        self.publisher = RabbitPublisher()

        # 구역별 이전 점유 상태 — 상태 변화 감지 및 오버레이 렌더링에 사용
        self._prev_state: dict[str, bool] = {}
        # 30초마다 전체 상태 강제 재전송 (admin 출차 후 _prev_state 불일치 자동 복구)
        self._last_full_resend = 0.0
        self._FORCE_RESEND_INTERVAL = 30.0
        # 10초마다 현재 점유 상태 콘솔 출력
        self._last_status_log = 0.0
        self._STATUS_LOG_INTERVAL = 10.0

    def start(self):
        self._stop_event.clear()
        self._thread.start()
        self._heartbeat_thread.start()
        print(f"[{self.camera_code}] 워커 시작 | 소스: {self.source}")

    def stop(self):
        self._stop_event.set()
        self._thread.join(timeout=10)
        self.publisher.close()
        print(f"[{self.camera_code}] 워커 중지")

    def is_running(self) -> bool:
        return self._thread.is_alive()

    def _run(self):
        cap = self._open_capture()
        last_processed = 0.0
        fail_count = 0
        MAX_FAIL = 10  # 연속 실패 이 횟수 초과 시 강제 재연결

        while not self._stop_event.is_set():
            ret, frame = cap.read()

            if not ret:
                fail_count += 1
                if fail_count >= MAX_FAIL:
                    # Windows MSMF 드라이버 고착 — COM 참조 완전 해제 후 재연결
                    wait = 10 if sys.platform == "win32" else 3
                    print(f"[{self.camera_code}] 프레임 읽기 {fail_count}회 연속 실패, {wait}초 후 강제 재연결...")
                    cap.release()
                    del cap
                    gc.collect()  # COM 참조 즉시 해제 (MSMF 고착 방지)
                    time.sleep(wait)
                    cap = self._open_capture()
                    fail_count = 0
                continue
            else:
                fail_count = 0

            # 구역 오버레이 그린 후 MJPEG 서버에 전달
            annotated = self.detector.draw_zones(frame, self._prev_state)
            mjpeg_server.update_frame(annotated)

            now = time.time()
            if now - last_processed < config.FRAME_INTERVAL:
                continue
            last_processed = now

            self._process_frame(frame)

        cap.release()

    def _open_capture(self) -> PiCameraCapture:
        retry_wait = 5 if sys.platform == "win32" else 2
        while not self._stop_event.is_set():
            cap = PiCameraCapture(source=self.source, width=1280, height=720)
            if cap.isOpened():
                return cap
            print(f"[{self.camera_code}] 카메라 연결 대기 중... ({retry_wait}초 후 재시도)")
            cap.release()
            gc.collect()
            time.sleep(retry_wait)
        return PiCameraCapture(source=self.source)

    def _run_heartbeat(self):
        """30초마다 camera_heartbeat 이벤트 발행 → cameras.last_seen_at 갱신"""
        while not self._stop_event.wait(HEARTBEAT_INTERVAL):
            try:
                event = {
                    "event_id":        str(uuid.uuid4()),
                    "event_type_code": "camera_heartbeat",
                    "camera_code":     self.camera_code,
                    "device_code":     self.device_code,
                    "camera_role":     "parking_view",
                    "ts":              datetime.now(timezone.utc).isoformat(),
                    "spot_id":         None,
                    "plate_text":      None,
                    "confidence":      None,
                    "image_ref":       None,
                    "payload":         {},
                }
                self.publisher.publish(event)
                print(f"[{self.camera_code}] heartbeat 발행")
            except Exception as e:
                print(f"[{self.camera_code}] heartbeat 실패: {e}")

    def _process_frame(self, frame):
        results = self.detector.detect(frame)

        if not results:
            return  # 아직 워밍업 중

        ts = datetime.now(timezone.utc).isoformat()

        now = time.time()
        force_resend = (now - self._last_full_resend) >= self._FORCE_RESEND_INTERVAL
        if force_resend:
            self._last_full_resend = now

        for r in results:
            spot_id     = r["spot_id"]
            is_occupied = r["is_occupied"]
            ratio       = r["occupancy_ratio"]
            prev        = self._prev_state.get(spot_id)

            state_changed = (prev != is_occupied)
            self._prev_state[spot_id] = is_occupied

            if not state_changed and not force_resend:
                continue

            if state_changed:
                status_str = "차량 감지" if is_occupied else "차량 떠남"
                print(
                    f"[{self.camera_code}] {status_str} | "
                    f"구역: {spot_id} | "
                    f"전경 비율: {ratio:.3f}"
                )

            event = {
                "event_id":        str(uuid.uuid4()),
                "event_type_code": "spot_status",
                "camera_code":     self.camera_code,
                "device_code":     self.device_code,
                "camera_role":     "parking_view",
                "ts":              ts,
                "spot_id":         spot_id,
                "plate_text":      None,
                "confidence":      ratio,
                "image_ref":       None,
                "payload":         {"is_occupied": 1 if is_occupied else 0},
            }
            self.publisher.publish(event)

        # 10초마다 전체 구역 현황 한 줄 출력
        if now - self._last_status_log >= self._STATUS_LOG_INTERVAL:
            self._last_status_log = now
            parts = []
            for r in results:
                mark = "O" if r["is_occupied"] else "-"
                parts.append(f"{r['spot_id']}:{mark}({r['occupancy_ratio']:.2f})")
            print(f"[{self.camera_code}] 현황 | {' | '.join(parts)}")
