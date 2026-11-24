"""
debug_detect.py — 카메라에서 프레임 1장을 찍어 YOLO 탐지 결과를 전부 출력한다.
1280×720 해상도로 캡처해서 실제 파이프라인과 동일한 조건으로 테스트.
"""

import sys
import time
import cv2
from ultralytics import YOLO

model = YOLO("yolov8s.pt")

print("카메라 열기 (1280×720)...")
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
time.sleep(2)

for _ in range(30):
    ret, frame = cap.read()
    if ret and frame is not None:
        break
    time.sleep(0.1)

if not ret:
    print("❌ 카메라 프레임 읽기 실패")
    cap.release()
    sys.exit(1)

h, w = frame.shape[:2]
print(f"✅ 프레임 캡처 성공: {w}×{h}")

print("\n[YOLO 탐지 결과] confidence ≥ 0.1 모든 클래스:")
results = model(frame, conf=0.1, verbose=False)[0]
names   = model.names

if len(results.boxes) == 0:
    print("  → 아무것도 탐지되지 않았습니다.")
else:
    for box in results.boxes:
        cls  = int(box.cls[0])
        conf = float(box.conf[0])
        x1, y1, x2, y2 = map(int, box.xyxy[0])
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        print(f"  클래스: {names[cls]:15s} | conf: {conf:.2f} | 중심: ({cx:4d}, {cy:4d}) | bbox: [{x1},{y1},{x2},{y2}]")

cap.release()

annotated = results.plot()
cv2.imwrite("debug_frame.jpg", annotated)
print("\n✅ 탐지 결과 이미지 저장됨: debug_frame.jpg")
print("   → 파일을 열어서 차량이 폴리곤 안에 있는지 확인하세요.")
