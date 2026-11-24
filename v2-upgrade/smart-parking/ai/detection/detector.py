"""
detection/detector.py
- YOLOv8을 이용해 프레임에서 차량을 탐지한다.
- 한 번만 모델을 로드하고 재사용한다.
- 현재 실행 경로(main.py)에서는 사용하지 않는다. 점유 판정은 zone_occupancy.py(MOG2 배경 차분)가 담당.
  실제 차량·번호판 인식으로 확장할 때 쓰기 위해 남겨둔 모듈이다.
"""

from ultralytics import YOLO
import config

# COCO 데이터셋 기준 차량 클래스 ID
VEHICLE_CLASSES = {
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
}


class VehicleDetector:
    def __init__(self):
        print(f"[Detector] 모델 로드 중: {config.YOLO_MODEL}")
        self.model = YOLO(config.YOLO_MODEL)
        print("[Detector] 모델 로드 완료")

    def detect(self, frame) -> list[dict]:
        """
        프레임에서 차량을 탐지한다.

        반환값 예시:
        [
            {
                "class": "car",
                "confidence": 0.91,
                "bbox": [x1, y1, x2, y2],
                "center": [cx, cy],
            },
            ...
        ]
        """
        results = self.model(frame, verbose=False)[0]
        detections = []

        for box in results.boxes:
            cls = int(box.cls[0])

            if cls not in VEHICLE_CLASSES:
                continue

            conf = float(box.conf[0])

            if conf < config.CONFIDENCE_THRESHOLD:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            detections.append({
                "class":      VEHICLE_CLASSES[cls],
                "confidence": round(conf, 4),
                "bbox":       [x1, y1, x2, y2],
                "center":     [cx, cy],
            })

        return detections
