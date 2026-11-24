"""
test_stream.py  ─ 2단계 테스트 스크립트
────────────────────────────────────────
사용 방법:

  # 1) RTSP 스트림으로 테스트 (실제 카메라)
  python test_stream.py --source rtsp://localhost:8554/CAM-A-G-01

  # 2) 동영상 파일로 테스트 (카메라 없을 때)
  python test_stream.py --source video.mp4

  # 3) PC 웹캠으로 테스트
  python test_stream.py --source 0

결과:
  - 탐지된 차량에 바운딩박스를 그려서 화면에 표시
  - 'q' 키를 누르면 종료
  - --save 옵션을 붙이면 output.mp4로 저장
"""

import argparse
import cv2
import sys
import os

# 루트 경로를 sys.path에 추가 (config, detection 임포트용)
sys.path.insert(0, os.path.dirname(__file__))

import config
from detection.detector import VehicleDetector

# 클래스별 색상 (BGR)
CLASS_COLORS = {
    "car":        (0,   255, 0),    # 초록
    "truck":      (255, 165, 0),    # 주황
    "bus":        (0,   0,   255),  # 빨강
    "motorcycle": (255, 0,   255),  # 보라
}


def draw_detections(frame, detections: list[dict]):
    """탐지 결과를 프레임에 그린다."""
    for det in detections:
        x1, y1, x2, y2 = det["bbox"]
        cx, cy         = det["center"]
        label          = det["class"]
        conf           = det["confidence"]
        color          = CLASS_COLORS.get(label, (255, 255, 0))

        # 바운딩박스
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # 중심점
        cv2.circle(frame, (cx, cy), 4, color, -1)

        # 라벨 (배경 포함)
        text = f"{label} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(frame, (x1, y1 - th - 8), (x1 + tw + 4, y1), color, -1)
        cv2.putText(frame, text, (x1 + 2, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

    # 우측 상단에 탐지 수 표시
    count_text = f"Detected: {len(detections)}"
    cv2.putText(frame, count_text, (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)

    return frame


def run(source, save: bool):
    detector = VehicleDetector()

    # source가 숫자면 웹캠 인덱스로 변환
    if str(source).isdigit():
        source = int(source)

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"[오류] 소스를 열 수 없습니다: {source}")
        return

    print(f"[테스트] 소스 연결 성공: {source}")
    print("[테스트] 'q' 키를 누르면 종료합니다.")

    # 저장 설정
    writer = None
    if save:
        w   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 20
        writer = cv2.VideoWriter(
            "output.mp4",
            cv2.VideoWriter_fourcc(*"mp4v"),
            fps, (w, h)
        )
        print("[테스트] 결과를 output.mp4에 저장합니다.")

    frame_count     = 0
    analyzed_count  = 0
    last_detections = []

    import time
    last_analyzed = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[테스트] 스트림 종료")
            break

        frame_count += 1
        now = time.time()

        # FRAME_INTERVAL 초마다 탐지 실행
        if now - last_analyzed >= config.FRAME_INTERVAL:
            last_analyzed    = now
            last_detections  = detector.detect(frame)
            analyzed_count  += 1

            if last_detections:
                print(f"[프레임 {frame_count}] 차량 {len(last_detections)}대 감지:")
                for d in last_detections:
                    print(f"  - {d['class']} | 신뢰도: {d['confidence']:.2f} | 중심: {d['center']}")
            else:
                print(f"[프레임 {frame_count}] 차량 없음")

        # 마지막 탐지 결과를 매 프레임에 표시 (화면은 부드럽게 유지)
        display = draw_detections(frame.copy(), last_detections)

        if writer:
            writer.write(display)

        cv2.imshow("AI Detection Test", display)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()
    print(f"[테스트 완료] 총 {frame_count}프레임 처리, {analyzed_count}회 탐지 실행")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="차량 탐지 테스트")
    parser.add_argument(
        "--source", default="0",
        help="RTSP URL / 동영상 파일 경로 / 웹캠 인덱스 (기본: 0)"
    )
    parser.add_argument(
        "--save", action="store_true",
        help="결과를 output.mp4로 저장"
    )
    args = parser.parse_args()

    run(args.source, args.save)
