# RTSP Stream Proxy API

라즈베리파이 웹캠의 RTSP 스트림을 관리하는 프록시 API

## Function URL
```
https://api.lumi.new/v1/functions/p379626134021566464/rtsp-stream-proxy
```

## Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer <lumi-auth-token>"
}
```

## Endpoints

### 1. GET - 카메라 목록 조회

**Request:**
```bash
curl -X GET "https://api.lumi.new/v1/functions/p379626134021566464/rtsp-stream-proxy" \
  -H "Authorization: Bearer <token>"
```

**Response:**
```json
{
  "success": true,
  "cameras": [
    {
      "_id": "...",
      "camera_id": "CAM-RPI-01",
      "location": "A동 주차장 입구",
      "streamUrl": "rtsp://192.168.1.100:8554/stream",
      "streamType": "rtsp",
      "status": "online",
      "lastChecked": "2025-01-22T10:30:00Z"
    }
  ]
}
```

### 2. POST - 스트림 제어

**Start Stream:**
```bash
curl -X POST "https://api.lumi.new/v1/functions/p379626134021566464/rtsp-stream-proxy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "CAM-RPI-01",
    "streamUrl": "rtsp://192.168.1.100:8554/stream",
    "action": "start"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Stream started",
  "cameraId": "CAM-RPI-01",
  "streamUrl": "rtsp://192.168.1.100:8554/stream"
}
```

**Stop Stream:**
```bash
curl -X POST "https://api.lumi.new/v1/functions/p379626134021566464/rtsp-stream-proxy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "CAM-RPI-01",
    "action": "stop"
  }'
```

**Check Status:**
```bash
curl -X POST "https://api.lumi.new/v1/functions/p379626134021566464/rtsp-stream-proxy" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "cameraId": "CAM-RPI-01",
    "action": "status"
  }'
```

## 라즈베리파이 설정

### 1. RTSP 서버 설치 (mediamtx)
```bash
# 라즈베리파이에서 실행
wget https://github.com/bluenviron/mediamtx/releases/download/v1.5.0/mediamtx_v1.5.0_linux_arm64v8.tar.gz
tar -xzf mediamtx_v1.5.0_linux_arm64v8.tar.gz
sudo mv mediamtx /usr/local/bin/
sudo mv mediamtx.yml /usr/local/etc/
```

### 2. 웹캠 스트리밍 시작
```bash
# FFmpeg으로 웹캠을 RTSP로 스트리밍
ffmpeg -f v4l2 -i /dev/video0 -c:v libx264 -preset ultrafast -tune zerolatency \
  -f rtsp rtsp://localhost:8554/stream
```

### 3. systemd 서비스 등록
```bash
sudo nano /etc/systemd/system/webcam-stream.service
```

```ini
[Unit]
Description=Webcam RTSP Stream
After=network.target

[Service]
Type=simple
User=pi
ExecStart=/usr/bin/ffmpeg -f v4l2 -i /dev/video0 -c:v libx264 -preset ultrafast -tune zerolatency -f rtsp rtsp://localhost:8554/stream
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable webcam-stream
sudo systemctl start webcam-stream
```

## 브라우저에서 RTSP 재생 제한

- 브라우저는 RTSP 프로토콜을 직접 지원하지 않음
- HLS/DASH/WebRTC로 변환 필요
- 대안 1: HLS 변환 (mediamtx 자동 지원)
- 대안 2: WebRTC 변환
- 대안 3: 정적 이미지 스냅샷 주기적 업데이트

## MongoDB camera_info 스키마

```typescript
{
  camera_id: "CAM-RPI-01",
  location: "A동 주차장 입구",
  streamUrl: "rtsp://192.168.1.100:8554/stream",  // RTSP URL
  hlsUrl: "http://192.168.1.100:8889/stream",     // HLS URL (mediamtx 자동 생성)
  ip: "192.168.1.100",
  model: "Raspberry Pi Camera v2",
  status: "online",
  lastChecked: "2025-01-22T10:30:00Z",
  streamType: "rtsp",
  createdAt: "2025-01-22T08:00:00Z",
  updatedAt: "2025-01-22T10:30:00Z"
}
```
