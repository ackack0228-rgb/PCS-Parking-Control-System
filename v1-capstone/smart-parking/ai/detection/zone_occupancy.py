"""
detection/zone_occupancy.py
────────────────────────────────────────────────────────────
배경 차분법(Background Subtraction)으로 주차 구역별 점유 여부를 판별한다.

YOLO 대신 사용할 수 있어서 장난감 차, 블록 등 실제 차가 아닌 물체도 감지된다.
각 구역 폴리곤 마스크 안의 픽셀 변화량이 임계값을 넘으면 "차 있음"으로 판단.

작동 원리:
  1. 구역마다 MOG2 배경 모델을 독립적으로 운용
  2. 처음 WARMUP_FRAMES 프레임 동안은 배경 학습만 하고 결과를 반환하지 않음
  3. 학습 완료 후, 전경 픽셀 비율 > OCCUPANCY_THRESHOLD → 점유 상태
  4. 폴리곤 좌표는 CALIB_W×CALIB_H 기준 — 실제 프레임 크기에 맞춰 자동 스케일링
"""

import cv2
import numpy as np

from detection.zones import get_polygons


WARMUP_FRAMES       = 20    # 배경 학습에 필요한 최소 프레임 수
OCCUPANCY_THRESHOLD = 0.4   # 전경 픽셀 비율 임계값 (40%)
DEBOUNCE_FRAMES     = 5     # 점유/비어있음 확정에 필요한 연속 프레임 수 (그림자 오탐 방지)

# 폴리곤 좌표가 캘리브레이션된 해상도 (calibrate_zones.py 실행 시 설정값)
CALIB_W = 1280
CALIB_H = 720


class ZoneOccupancyDetector:
    def __init__(self, camera_code: str):
        self.camera_code = camera_code
        zones = get_polygons(camera_code)

        # 구역마다 독립 MOG2 배경 모델 + 마스크 + 상태
        self._zones   = {}   # spot_id → {"poly", "mask", "bg", "frame_count"}
        self._frame_h = None
        self._frame_w = None
        self._ready   = False  # 첫 프레임 이후 마스크가 초기화됐는지

        for z in zones:
            self._zones[z["spot_id"]] = {
                "poly":        np.array(z["polygon"], dtype=np.float32),
                "label_pos":   z.get("label_pos"),
                "forbidden":   z.get("forbidden", False),
                "threshold":   z.get("threshold", OCCUPANCY_THRESHOLD),
                "mask":        None,  # 첫 프레임에서 초기화
                "bg":          cv2.createBackgroundSubtractorMOG2(
                                   history=40, varThreshold=50, detectShadows=True
                               ),
                "frame_count":    0,
                "consec_above":   0,      # 임계값 초과 연속 프레임 수 (점유 확정용)
                "consec_below":   0,      # 임계값 미만 연속 프레임 수 (비어있음 확정용)
                "stable_occupied": False, # 디바운스된 최종 점유 여부
            }

    def _init_masks(self, h: int, w: int):
        """실제 프레임 크기 기준으로 폴리곤을 스케일링해 마스크를 생성한다."""
        scale_x = w / CALIB_W
        scale_y = h / CALIB_H
        for z in self._zones.values():
            scaled = (z["poly"] * [scale_x, scale_y]).astype(np.int32)
            mask = np.zeros((h, w), dtype=np.uint8)
            cv2.fillPoly(mask, [scaled], 255)
            z["mask"]        = mask
            z["scaled_poly"] = scaled  # 오버레이 렌더링용
            if z["label_pos"] is not None:
                lx, ly = z["label_pos"]
                z["scaled_label_pos"] = (int(lx * scale_x), int(ly * scale_y))
            else:
                z["scaled_label_pos"] = None
        self._frame_h = h
        self._frame_w = w
        self._ready   = True
        print(f"[ZoneOccupancy] 마스크 초기화: {w}×{h} (스케일 x={scale_x:.2f}, y={scale_y:.2f})")

    def detect(self, frame: np.ndarray) -> list[dict]:
        """
        프레임을 받아 구역별 점유 상태를 반환한다.

        반환값 예시:
          [
            {"spot_id": "A1-001", "is_occupied": True,  "occupancy_ratio": 0.12},
            {"spot_id": "A1-002", "is_occupied": False, "occupancy_ratio": 0.01},
          ]

        학습 중(warmup)인 구역은 결과에서 제외된다.
        """
        h, w = frame.shape[:2]
        if not self._ready:
            self._init_masks(h, w)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        results = []

        for spot_id, z in self._zones.items():
            mask = z["mask"]
            bg   = z["bg"]

            # 워밍업 중에는 배경 학습, 이후에는 배경 고정(learningRate=0)
            lr = -1 if z["frame_count"] < WARMUP_FRAMES else 0.0
            fg_mask = bg.apply(gray, learningRate=lr)

            # detectShadows=True 시 그림자는 127로 표시됨 → 255(진짜 전경)만 카운트
            _, fg_true = cv2.threshold(fg_mask, 200, 255, cv2.THRESH_BINARY)
            fg_in_zone = cv2.bitwise_and(fg_true, fg_true, mask=mask)

            zone_area = int(cv2.countNonZero(mask))
            fg_pixels = int(cv2.countNonZero(fg_in_zone))

            z["frame_count"] += 1

            # 워밍업 기간에는 결과 제외
            if z["frame_count"] < WARMUP_FRAMES:
                continue

            ratio     = fg_pixels / zone_area if zone_area > 0 else 0.0
            threshold = z.get("threshold", OCCUPANCY_THRESHOLD)
            debounce  = z.get("debounce", DEBOUNCE_FRAMES)

            # 양방향 디바운스: 점유·비어있음 모두 N프레임 연속 확인 후 상태 전환
            if ratio > threshold:
                z["consec_above"] += 1
                z["consec_below"] = 0
            else:
                z["consec_below"] += 1
                z["consec_above"] = 0

            if z["consec_above"] >= debounce:
                z["stable_occupied"] = True
            elif z["consec_below"] >= debounce:
                z["stable_occupied"] = False
            # 그 사이면 이전 상태 유지 (그림자·조명 변화로 인한 깜빡임 방지)

            results.append({
                "spot_id":         spot_id,
                "is_occupied":     z["stable_occupied"],
                "occupancy_ratio": round(ratio, 4),
            })

        return results

    def draw_zones(self, frame: np.ndarray, occupancy: dict) -> np.ndarray:
        """
        구역 폴리곤 오버레이를 프레임에 그려 반환한다.
        occupancy: {spot_id: bool} — True=점유(빨강), False=비어있음(초록), 없으면 회색
        """
        if not self._ready:
            return frame

        out     = frame.copy()
        overlay = out.copy()

        # 반투명 채우기
        for spot_id, z in self._zones.items():
            poly = z.get("scaled_poly")
            if poly is None:
                continue
            if z["forbidden"]:
                color = (0, 0, 180)    # 금지구역 — 항상 빨강
            else:
                state = occupancy.get(spot_id)
                if state is True:
                    color = (0, 0, 200)
                elif state is False:
                    color = (0, 200, 0)
                else:
                    color = (80, 80, 80)
            cv2.fillPoly(overlay, [poly], color)

        cv2.addWeighted(overlay, 0.25, out, 0.75, 0, out)

        # 테두리 + 레이블
        for spot_id, z in self._zones.items():
            poly = z.get("scaled_poly")
            if poly is None:
                continue
            if z["forbidden"]:
                color  = (0, 0, 255)   # 금지구역 — 항상 빨강
                label2 = "FORBIDDEN"
            else:
                state = occupancy.get(spot_id)
                if state is True:
                    color  = (0, 60, 255)
                    label2 = "OCCUPIED"
                elif state is False:
                    color  = (0, 230, 0)
                    label2 = "EMPTY"
                else:
                    color  = (120, 120, 120)
                    label2 = "INIT"

            cv2.polylines(out, [poly], True, color, 2)

            slp = z.get("scaled_label_pos")
            if slp is not None:
                cx, cy = slp
            else:
                cx = int(poly[:, 0].mean())
                cy = int(poly[:, 1].mean())
            cv2.putText(out, spot_id, (cx - 38, cy - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(out, label2, (cx - 38, cy + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.48, color, 1, cv2.LINE_AA)

        return out
