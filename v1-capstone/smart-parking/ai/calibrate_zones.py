"""
calibrate_zones.py  ─ 주차 구역 폴리곤 캘리브레이션 도구
──────────────────────────────────────────────────────────
사용 방법:

  # PC 웹캠 (기본)
  python calibrate_zones.py

  # RTSP 스트림
  python calibrate_zones.py --source rtsp://localhost:8554/CAM-A-G-01

  # 동영상 파일
  python calibrate_zones.py --source video.mp4

  # 카메라 코드 지정 (zones.py에서 불러올 구역, 기본: CAM-A-G-01)
  python calibrate_zones.py --camera CAM-A-G-01

조작법:
  마우스 좌클릭  — 꼭짓점 추가 (현재 새 폴리곤 작성 중)
  Enter          — 현재 찍은 꼭짓점들로 폴리곤 완성 → 콘솔에 좌표 출력
  Backspace      — 마지막 꼭짓점 취소
  r              — 현재 작업 중인 폴리곤 초기화
  q / ESC        — 종료

결과:
  - 화면에 zones.py에 정의된 기존 구역(초록)과
    현재 작업 중인 새 폴리곤(노랑 점선)을 동시에 표시
  - Enter를 누르면 콘솔에 zones.py 붙여넣기용 좌표가 출력됨
"""

import argparse
import sys
import os
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from detection.zones import get_polygons


# ── 색상 ──────────────────────────────────────────────────────
COLOR_EXISTING  = (0,   200,  0)    # 기존 구역: 초록
COLOR_FORBIDDEN = (0,   0,   220)   # 금지구역: 빨강
COLOR_WORKING   = (0,   220, 220)   # 작업 중: 노랑
COLOR_POINT     = (255, 255, 255)   # 꼭짓점: 흰색
COLOR_TEXT_BG   = (30,  30,  30)    # 텍스트 배경: 다크


def draw_polygon_filled(frame, pts, color, alpha=0.25):
    """반투명 폴리곤을 프레임에 그린다."""
    if len(pts) < 3:
        return
    overlay = frame.copy()
    cv2.fillPoly(overlay, [np.array(pts, dtype=np.int32)], color)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    cv2.polylines(frame, [np.array(pts, dtype=np.int32)], isClosed=True, color=color, thickness=2)


def draw_label(frame, text, pos, color):
    """배경이 있는 텍스트 라벨을 그린다."""
    x, y = pos
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 1)
    cv2.rectangle(frame, (x, y - th - 6), (x + tw + 4, y + 2), COLOR_TEXT_BG, -1)
    cv2.putText(frame, text, (x + 2, y - 2),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)


def draw_existing_zones(frame, camera_code: str):
    """zones.py에 정의된 구역을 그린다."""
    zones = get_polygons(camera_code)
    for zone in zones:
        spot_id = zone["spot_id"]
        pts     = zone["polygon"]
        # spot_id에 'forbidden' 느낌이 들면 빨강, 아니면 초록
        color = COLOR_FORBIDDEN if "999" in spot_id or "forb" in spot_id.lower() else COLOR_EXISTING
        draw_polygon_filled(frame, pts, color)
        if pts:
            cx = int(np.mean([p[0] for p in pts]))
            cy = int(np.mean([p[1] for p in pts]))
            draw_label(frame, spot_id, (cx - 30, cy), color)


def draw_working_polygon(frame, pts, mouse_pos):
    """현재 작업 중인 미완성 폴리곤을 그린다."""
    if not pts:
        return

    # 꼭짓점 표시
    for i, (x, y) in enumerate(pts):
        cv2.circle(frame, (x, y), 5, COLOR_POINT, -1)
        draw_label(frame, str(i), (x + 6, y), COLOR_WORKING)

    # 선 연결
    for i in range(len(pts) - 1):
        cv2.line(frame, tuple(pts[i]), tuple(pts[i+1]), COLOR_WORKING, 1, cv2.LINE_AA)

    # 마지막 점 → 마우스 위치 미리보기 선
    if mouse_pos:
        cv2.line(frame, tuple(pts[-1]), mouse_pos, COLOR_WORKING, 1, cv2.LINE_AA)
        # 첫 점 → 마우스 위치 (닫힘 미리보기)
        if len(pts) >= 2:
            cv2.line(frame, tuple(pts[0]), mouse_pos, COLOR_WORKING, 1, cv2.LINE_AA)


def draw_hud(frame, working_pts):
    """화면 상단에 조작 안내를 표시한다."""
    lines = [
        "좌클릭: 꼭짓점 추가  |  Enter: 폴리곤 완성  |  Backspace: 되돌리기  |  r: 초기화  |  q: 종료",
        f"현재 꼭짓점 수: {len(working_pts)}",
    ]
    for i, line in enumerate(lines):
        cv2.putText(frame, line, (8, 22 + i * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1, cv2.LINE_AA)


def print_polygon(pts):
    """zones.py에 붙여넣기 쉬운 형식으로 좌표를 출력한다."""
    print("\n" + "=" * 50)
    print("▶ zones.py 복사용 polygon 좌표:")
    print('"polygon": [')
    for x, y in pts:
        print(f"    [{x}, {y}],")
    print("],")
    print("=" * 50 + "\n")


# ── 마우스 콜백 ──────────────────────────────────────────────

class ZoneCalibrator:
    def __init__(self):
        self.working_pts: list[tuple] = []
        self.mouse_pos: tuple | None  = None

    def on_mouse(self, event, x, y, flags, param):
        self.mouse_pos = (x, y)
        if event == cv2.EVENT_LBUTTONDOWN:
            self.working_pts.append((x, y))
            print(f"  꼭짓점 {len(self.working_pts) - 1}: ({x}, {y})")


# ── 메인 루프 ────────────────────────────────────────────────

def run(source, camera_code: str):
    if str(source).isdigit():
        source = int(source)

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[오류] 소스를 열 수 없습니다: {source}")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    print(f"[캘리브레이션] 해상도: {w}×{h} | 카메라 코드: {camera_code}")
    print("[캘리브레이션] 창에 마우스를 올리고 꼭짓점을 클릭하세요.\n")

    calibrator = ZoneCalibrator()

    cv2.namedWindow("Zone Calibration", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("Zone Calibration", 1280, 720)
    cv2.setMouseCallback("Zone Calibration", calibrator.on_mouse)

    import time
    time.sleep(2)
    frozen = None
    for _ in range(50):
        ret, frame = cap.read()
        if ret and frame is not None:
            frozen = frame
            break
        time.sleep(0.1)

    if frozen is None:
        print("[오류] 첫 프레임을 읽을 수 없습니다.")
        return

    while True:
        # 매 프레임 갱신 (스트림이면 실시간, 아니면 이전 프레임 유지)
        ret, frame = cap.read()
        if ret:
            frozen = frame.copy()

        display = frozen.copy()

        # 기존 구역 그리기
        draw_existing_zones(display, camera_code)

        # 작업 중 폴리곤 그리기
        draw_working_polygon(display, calibrator.working_pts, calibrator.mouse_pos)

        # HUD
        draw_hud(display, calibrator.working_pts)

        cv2.imshow("Zone Calibration", display)

        key = cv2.waitKey(30) & 0xFF

        if key in (ord("q"), 27):   # q 또는 ESC
            break
        elif key == 13:             # Enter — 폴리곤 완성
            if len(calibrator.working_pts) >= 3:
                print_polygon(calibrator.working_pts)
                calibrator.working_pts = []
            else:
                print("[경고] 폴리곤을 완성하려면 꼭짓점이 3개 이상 필요합니다.")
        elif key == 8:              # Backspace — 마지막 점 취소
            if calibrator.working_pts:
                removed = calibrator.working_pts.pop()
                print(f"  꼭짓점 제거: {removed}")
        elif key == ord("r"):       # r — 초기화
            calibrator.working_pts = []
            print("  작업 중인 폴리곤을 초기화했습니다.")

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="주차 구역 폴리곤 캘리브레이션")
    parser.add_argument("--source", default="0",
                        help="RTSP URL / 동영상 파일 / 웹캠 인덱스 (기본: 0)")
    parser.add_argument("--camera", default="CAM-A-G-01",
                        help="zones.py 카메라 코드 (기본: CAM-A-G-01)")
    args = parser.parse_args()

    run(args.source, args.camera)
