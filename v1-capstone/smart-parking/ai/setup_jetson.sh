#!/bin/bash
# ================================================
# Jetson Orin Nano AI 서비스 초기 설치 스크립트
# 실행: bash setup_jetson.sh
#
# 전제 조건:
#   - JetPack 6.x 설치 완료
#   - 인터넷 연결
# ================================================

set -e

echo "=== 1. 시스템 패키지 업데이트 ==="
sudo apt update && sudo apt upgrade -y

echo "=== 2. 시스템 의존성 설치 ==="
sudo apt install -y \
    python3-pip \
    python3-venv \
    v4l-utils \
    libopencv-dev

echo "=== 3. 카메라 연결 확인 ==="
echo "연결된 카메라 장치:"
v4l2-ctl --list-devices 2>/dev/null || echo "(v4l2-ctl 없음, 건너뜀)"
ls /dev/video* 2>/dev/null || echo "카메라 장치를 찾을 수 없습니다. USB 카메라를 연결하세요."

echo "=== 4. Python 가상환경 생성 ==="
python3 -m venv venv --system-site-packages
# --system-site-packages: JetPack이 설치한 시스템 PyTorch를 가상환경에서 그대로 사용
source venv/bin/activate

echo "=== 5. CUDA 지원 PyTorch 확인 ==="
python3 -c "import torch; print('PyTorch:', torch.__version__, '| CUDA:', torch.cuda.is_available())" 2>/dev/null && {
    echo ">>> 기존 PyTorch 사용"
} || {
    echo ">>> PyTorch 없음, NVIDIA 공식 wheel 설치 시도..."
    # JetPack 6.x 기준 PyTorch 설치
    # 버전이 다르면 https://developer.download.nvidia.com/compute/redist/jp/ 에서 확인
    pip install --no-cache \
        https://developer.download.nvidia.com/compute/redist/jp/v60/pytorch/torch-2.3.0a0+ebedce2.nv24.04-cp310-cp310-linux_aarch64.whl \
        2>/dev/null || echo ">>> 수동 설치 필요: https://developer.download.nvidia.com/compute/redist/jp/"
}

echo "=== 6. Python 패키지 설치 ==="
pip install --upgrade pip
pip install -r requirements_jetson.txt

echo "=== 7. GPU 동작 확인 ==="
python3 -c "
import torch
from ultralytics import YOLO
print('CUDA 사용 가능:', torch.cuda.is_available())
if torch.cuda.is_available():
    print('GPU:', torch.cuda.get_device_name(0))
else:
    print('경고: CUDA를 사용할 수 없습니다. CPU로 실행됩니다.')
"

echo "=== 8. .env 파일 설정 ==="
if [ ! -f .env ]; then
    cp .env.jetson.example .env
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
echo "  1. nano .env  → SERVER_IP=메인노트북IP 설정"
echo "  2. source venv/bin/activate"
echo "  3. python main.py"
echo ""
echo "메인 노트북 IP 확인 방법 (메인 노트북에서):"
echo "  Windows: ipconfig | findstr IPv4"
echo "  Mac/Linux: hostname -I"
