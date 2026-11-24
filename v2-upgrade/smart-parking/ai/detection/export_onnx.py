"""
detection/export_onnx.py
────────────────────────────────────────────────────────────
YOLOv8 모델을 ONNX 형식으로 변환한다.
라즈베리파이에서 추론 속도를 높이기 위해 사용한다.

실행:
  python detection/export_onnx.py

결과:
  yolov8n.onnx 파일 생성
  → .env에서 YOLO_MODEL=yolov8n.onnx 로 변경하면 자동 적용
"""

from ultralytics import YOLO
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import config

def export():
    print(f"[Export] {config.YOLO_MODEL} → ONNX 변환 중...")
    model = YOLO(config.YOLO_MODEL)

    # imgsz=640: 입력 해상도 (낮출수록 빠르지만 정확도 감소)
    export_path = model.export(
        format="onnx",
        imgsz=640,
        simplify=True,   # 불필요한 노드 제거 → 속도 향상
    )

    print(f"[Export] 완료: {export_path}")
    print()
    print(".env에서 다음과 같이 변경하세요:")
    onnx_name = config.YOLO_MODEL.replace(".pt", ".onnx")
    print(f"  YOLO_MODEL={onnx_name}")

if __name__ == "__main__":
    export()
