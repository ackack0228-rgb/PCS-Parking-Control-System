#!/bin/bash
# ================================================
# 라즈베리파이 AI 서비스 초기 설치 스크립트
# 실행: bash setup_pi.sh
# ================================================

set -e

echo "=== 1. 시스템 패키지 업데이트 ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. 의존성 설치 ==="
sudo apt install -y \
    python3-pip \
    python3-venv \
    libopencv-dev \
    python3-opencv \
    v4l-utils          # 웹캠 장치 확인용

echo "=== 3. 웹캠 연결 확인 ==="
echo "연결된 카메라 장치:"
v4l2-ctl --list-devices 2>/dev/null || echo "(v4l2-ctl 없음, 건너뜀)"
ls /dev/video* 2>/dev/null || echo "카메라 장치를 찾을 수 없습니다. 웹캠이 연결되어 있는지 확인하세요."

echo "=== 4. Python 가상환경 생성 ==="
python3 -m venv venv
source venv/bin/activate

echo "=== 5. Python 패키지 설치 (시간이 걸립니다) ==="
pip install --upgrade pip
pip install -r requirements_pi.txt

echo "=== 6. .env 파일 설정 ==="
if [ ! -f .env ]; then
    cp .env.pi.example .env
    echo ""
    echo ">>> .env 파일이 생성되었습니다."
    echo ">>> SERVER_IP를 메인 노트북의 IP로 변경하세요:"
    echo "    nano .env"
else
    echo ".env 파일이 이미 존재합니다. 건너뜁니다."
fi

echo ""
echo "=== 설치 완료 ==="
echo ""
echo "다음 단계:"
echo "  1. nano .env  → SERVER_IP 설정"
echo "  2. source venv/bin/activate"
echo "  3. python main.py"
