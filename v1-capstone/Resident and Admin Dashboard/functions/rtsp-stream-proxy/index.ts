/**
 * RTSP Stream Proxy for Raspberry Pi Webcam
 * --------------------------------------------------------
 * 라즈베리파이 웹캠의 RTSP 스트림을 받아 HLS/WebRTC로 변환
 * 실시간 CCTV 모니터링을 위한 프록시 서버
 */

import { createClient } from "@lumi.new/sdk"

interface StreamRequest {
  cameraId: string
  streamUrl?: string // RTSP URL (rtsp://192.168.1.100:8554/stream)
  action?: "start" | "stop" | "status"
}

Deno.serve(async (req) => {
  console.log(JSON.stringify({
    stage: "start",
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  }))

  // CORS 헤더
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers })
  }

  try {
    const projectId = Deno.env.get("PROJECT_ID")
    const apiBaseUrl = Deno.env.get("API_BASE_URL")
    const authOrigin = Deno.env.get("AUTH_ORIGIN")
    const mediamtxBaseUrl = Deno.env.get("MEDIAMTX_BASE_URL") || "http://localhost:8889"
    
    if (!projectId || !apiBaseUrl || !authOrigin) {
      throw new Error("Missing required environment variables")
    }

    // Authorization 헤더에서 토큰 추출
    const authorization = req.headers.get("Authorization") || ""
    
    const lumi = createClient({
      projectId,
      apiBaseUrl,
      authOrigin,
      authorization
    })

    // 현재 사용자 가져오기
    // 주의: 토큰이 비어 있으면 refreshUser()가 에러 없이 undefined를 돌려준다 → 반드시 따로 거부
    if (!authorization.startsWith("Bearer ") || authorization.length < 17) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다" }), { status: 401, headers })
    }
    let user
    try {
      user = await lumi.auth.refreshUser()
    } catch {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다" }), { status: 401, headers })
    }
    if (!user || !user.userId) {
      return new Response(JSON.stringify({ error: "로그인이 필요합니다" }), { status: 401, headers })
    }
    // 카메라 정보 조회·상태 변경은 관리자만
    if (user.userRole !== "ADMIN") {
      return new Response(JSON.stringify({ error: "권한이 없습니다" }), { status: 403, headers })
    }
    console.log(JSON.stringify({
      stage: "auth",
      userId: user.userId,
      userRole: user.userRole
    }))

    if (req.method === "GET") {
      // 카메라 목록 조회 (MongoDB에서)
      const { list: cameras } = await lumi.entities.camera_info.list({
        limit: 100,
        sort: { createdAt: -1 }
      })

      console.log(JSON.stringify({
        stage: "response",
        cameraCount: cameras.length
      }))

      return new Response(JSON.stringify({
        success: true,
        cameras: cameras.map((cam: Record<string, unknown>) => ({
          ...cam,
          streamType: cam.streamUrl?.startsWith("rtsp://") ? "rtsp" : 
                     cam.streamUrl?.startsWith("http") ? "http" : "static",
          // HLS URL 자동 생성 (MediaMTX 기준)
          hlsUrl: cam.hlsUrl || (cam.camera_id ? `${mediamtxBaseUrl}/${cam.camera_id}/index.m3u8` : null)
        }))
      }), { status: 200, headers })
    }

    if (req.method === "POST") {
      const body: StreamRequest = await req.json()
      console.log(JSON.stringify({
        stage: "request",
        cameraId: body.cameraId,
        action: body.action
      }))

      const { cameraId, streamUrl, action = "status" } = body

      if (!cameraId) {
        return new Response(JSON.stringify({
          error: "cameraId is required"
        }), { status: 400, headers })
      }

      // 카메라 정보 조회
      const { list: cameras } = await lumi.entities.camera_info.list({
        filter: { camera_id: cameraId },
        limit: 1
      })

      if (cameras.length === 0) {
        return new Response(JSON.stringify({
          error: "Camera not found"
        }), { status: 404, headers })
      }

      const camera = cameras[0]

      // 액션 처리
      switch (action) {
        case "start":
          // RTSP 스트림 시작 로직 (실제 구현 시 FFmpeg 사용)
          console.log(JSON.stringify({
            stage: "stream_start",
            cameraId,
            streamUrl: streamUrl || camera.streamUrl
          }))

          // 카메라 상태 업데이트
          await lumi.entities.camera_info.update(camera._id, {
            status: "online",
            lastChecked: new Date().toISOString()
          })

          return new Response(JSON.stringify({
            success: true,
            message: "Stream started",
            cameraId,
            streamUrl: streamUrl || camera.streamUrl
          }), { status: 200, headers })

        case "stop":
          console.log(JSON.stringify({
            stage: "stream_stop",
            cameraId
          }))

          await lumi.entities.camera_info.update(camera._id, {
            status: "offline",
            lastChecked: new Date().toISOString()
          })

          return new Response(JSON.stringify({
            success: true,
            message: "Stream stopped",
            cameraId
          }), { status: 200, headers })

        case "status":
        default: {
          // 스트림 상태 확인
          const isRtsp = camera.streamUrl?.startsWith("rtsp://")
          const hlsUrl = camera.hlsUrl || `${mediamtxBaseUrl}/${cameraId}/index.m3u8`

          // MediaMTX API로 실제 스트림 상태 확인
          let isStreamActive = false
          try {
            const mediamtxApiUrl = Deno.env.get("MEDIAMTX_BASE_URL")?.replace(":8889", ":8888") || "http://localhost:8888"
            const pathsResponse = await fetch(`${mediamtxApiUrl}/v3/paths/list`)
            if (pathsResponse.ok) {
              const paths = await pathsResponse.json()
              isStreamActive = paths.items?.some((p: { name: string }) => p.name === cameraId)
            }
          } catch (e) {
            console.log("MediaMTX API 호출 실패 (정상 동작)", e)
          }
          
          return new Response(JSON.stringify({
            success: true,
            cameraId,
            status: isStreamActive ? "streaming" : (camera.status || "unknown"),
            streamUrl: camera.streamUrl,
            hlsUrl,
            streamType: isRtsp ? "rtsp" : "http",
            lastChecked: camera.lastChecked,
            isStreamActive,
            note: isRtsp
              ? `RTSP → HLS 변환됨. 재생 URL: ${hlsUrl}`
              : "HTTP 스트림은 직접 재생 가능"
          }), { status: 200, headers })
        }
      }
    }

    return new Response(JSON.stringify({
      error: "Method not allowed"
    }), { status: 405, headers })

  } catch (error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error))
    console.error(JSON.stringify({
      stage: "error",
      type: e.constructor.name,
      message: e.message,
      stack: e.stack
    }))

    return new Response(JSON.stringify({
      error: "Internal server error"  // 내부 에러 메시지는 로그에만 남기고 응답에는 넣지 않는다
    }), { status: 500, headers: {
      ...headers,
      "Content-Type": "application/json"
    }})
  }
})
