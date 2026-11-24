"""
detection/zones.py
- 카메라별 주차 구역 폴리곤을 정의한다.
- 탐지된 차량의 중심점(cx, cy)이 어느 구역에 속하는지 판별한다.

폴리곤 좌표 조정 방법:
  1. python calibrate_zones.py 실행 → 화면에서 꼭짓점을 클릭해 좌표 측정
  2. 각 주차 구역 꼭짓점 픽셀 좌표를 측정해서 아래 polygon 값을 교체
  3. 해상도가 다른 카메라는 새 카메라 코드 키를 추가

주의:
  - spot_id는 DB의 parking_spots.spot_id와 반드시 일치해야 함
  - 금지구역은 spot_type_code='forbidden'으로 seed.sql에 등록되어 있어야 위반이 생성됨
"""

import cv2
import numpy as np


# ── 카메라별 구역 정의 ────────────────────────────────────────
# 각 카메라 코드에 구역 목록을 매핑한다.
# polygon: 시계 방향(또는 반시계 방향) 순서로 꼭짓점 좌표 [x, y] 나열
#          (640×480 기준 예시 — 실제 카메라 화면 보고 수정 필요)
#
# spot_id 매핑 (seed.sql 기준):
#   A1-001 → 일반 주차면 (normal)
#   A1-999 → 금지구역   (forbidden)

ZONES: dict[str, list[dict]] = {
    "CAM-A-G-01": [
        {
            "spot_id": "A1-001",
            "threshold": 0.15,
            "polygon": [
                [925, 141],
                [976, 505],
                [721, 502],
                [714, 135],
            ],
        },
        {
            "spot_id": "A1-002",
            "threshold": 0.15,
            "polygon": [
                [710, 136],
                [716, 501],
                [455, 495],
                [490, 132],
            ],
        },
        {
            "spot_id": "A1-003",
            "threshold": 0.15,
            "polygon": [
                [490, 132],
                [453, 497],
                [221, 490],
                [293, 133],
            ],
        },
        {
            "spot_id": "A1-999",          # 금지구역 — 마지막에 체크 (일반 구역 우선)
            "forbidden": True,
            "threshold": 0.1,             # 넓은 구역이라 기본값(0.4) 대신 0.1 사용
            "polygon": [
                [244, 104],
                [293, 104],
                [206, 502],
                [991, 511],
                [931, 119],
                [979, 120],
                [1078, 711],
                [72,  719],
            ],
            "label_pos": [575, 620],      # 주차칸 아래 통로 영역에 레이블 표시
        },
    ],
}

# CAM-GATE-01은 CAM-A-G-01과 같은 물리 카메라 — 동일 폴리곤 재사용
ZONES["CAM-GATE-01"] = ZONES["CAM-A-G-01"]


# ── 포인트 인 폴리곤 ─────────────────────────────────────────

def find_spot(camera_code: str, cx: int, cy: int) -> str | None:
    """
    (cx, cy) 좌표가 해당 카메라의 어느 구역 폴리곤 안에 있는지 반환한다.
    어느 구역에도 속하지 않으면 None을 반환한다.

    반환값: parking_spots.spot_id 문자열 또는 None
    """
    zones = ZONES.get(camera_code)
    if not zones:
        return None

    point = (float(cx), float(cy))

    for zone in zones:
        poly = np.array(zone["polygon"], dtype=np.float32)
        # 반환값: 양수=내부, 0=경계, 음수=외부
        result = cv2.pointPolygonTest(poly, point, measureDist=False)
        if result >= 0:
            return zone["spot_id"]

    return None


def get_polygons(camera_code: str) -> list[dict]:
    """
    디버그/시각화용: 특정 카메라의 구역 목록 전체를 반환한다.
    """
    return ZONES.get(camera_code, [])
