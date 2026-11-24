import urllib.request, numpy as np, cv2

try:
    with urllib.request.urlopen("http://localhost:8090/snapshot", timeout=3) as r:
        data = r.read()
    arr = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    print(f"snapshot OK: {frame.shape}")
except Exception as e:
    print(f"snapshot fail: {e}, using blank")
    frame = np.zeros((720, 1280, 3), dtype=np.uint8)

zones = [
    ("A1-001", (0,200,255),  [[925,141],[976,505],[721,502],[714,135]]),
    ("A1-002", (0,255,100),  [[710,136],[716,501],[455,495],[490,132]]),
    ("A1-003", (255,180,0),  [[490,132],[453,497],[221,490],[293,133]]),
    ("A1-999", (0,0,220),    [[244,104],[293,104],[206,502],[991,511],[931,119],[979,120],[1078,711],[72,719]]),
]

overlay = frame.copy()
for name, color, pts in zones:
    poly = np.array(pts, np.int32)
    cv2.fillPoly(overlay, [poly], color)

cv2.addWeighted(overlay, 0.35, frame, 0.65, 0, frame)

for name, color, pts in zones:
    poly = np.array(pts, np.int32)
    cv2.polylines(frame, [poly], True, color, 2)
    cx = int(np.mean([p[0] for p in pts]))
    cy = int(np.mean([p[1] for p in pts]))
    cv2.putText(frame, name, (cx-35, cy), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

import os
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "zones_preview.png")  # 스크립트 옆에 저장
cv2.imwrite(out, frame)
print("saved: " + out)
