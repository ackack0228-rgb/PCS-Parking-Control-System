import { useState, useEffect, useRef } from "react"
import Hls from "hls.js"
import AdminSidebar from "../../components/admin/AdminSidebar"
import { Camera, MapPin, WifiOff, Signal, X, Maximize2, Bell, Plus, AlertTriangle } from 'lucide-react'
import { getCameraStats, getSpotsStats, getOpenViolations, getForbiddenOccupied, IllegalParkingEntry, tokenQuery } from "../../lib/api"

const HLS_BASE  = import.meta.env.VITE_HLS_BASE_URL  || "http://localhost:8889"
const MJPEG_BASE = import.meta.env.VITE_MJPEG_BASE_URL || "http://localhost:8090"

// 카메라별 스트림 URL — MJPEG 서버가 있으면 우선 사용, 없으면 HLS
function streamUrl(cameraCode: string): { type: "mjpeg" | "hls"; url: string } {
  // 현재 노트북 웹캠은 MJPEG 서버로 직접 스트림
  if (cameraCode === "CAM-GATE-01") {
    // <img>는 헤더를 못 붙이므로 토큰을 쿼리로 전달 (AI 서버가 백엔드 /auth/me로 확인)
    return { type: "mjpeg", url: `${MJPEG_BASE}/stream?${tokenQuery()}` }
  }
  return { type: "hls", url: `${HLS_BASE}/${cameraCode}/index.m3u8` }
}

// MJPEG: <img> 태그 하나로 끝 (브라우저 기본 지원)
function MjpegPlayer({ url, online, className }: { url: string; online: boolean; className?: string }) {
  const [error, setError] = useState(false)

  if (!online) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl ${className ?? ""}`} style={{ background: "#0d1220", border: "1px solid #1e3a5f" }}>
        <WifiOff className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-500 text-sm">카메라 오프라인</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-xl ${className ?? ""}`} style={{ background: "#0d1220", border: "1px solid #1e3a5f" }}>
        <WifiOff className="w-8 h-8 text-slate-600 mb-2" />
        <p className="text-slate-500 text-xs">스트림 연결 대기 중...</p>
      </div>
    )
  }
  return (
    <img
      src={url}
      className={`w-full h-full rounded-xl bg-black object-contain ${className ?? ""}`}
      onError={() => setError(true)}
      alt="CCTV 스트림"
    />
  )
}

// HLS 스트림을 <video> 태그에 연결하는 컴포넌트
function HlsPlayer({ cameraCode, online }: { cameraCode: string; online: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!online || !videoRef.current) return
    const src = `${HLS_BASE}/${cameraCode}/index.m3u8`
    const video = videoRef.current

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true })
      hls.loadSource(src)
      hls.attachMedia(video)
      return () => hls.destroy()
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
    }
  }, [cameraCode, online])

  if (!online) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center rounded-xl" style={{ background: "#0d1220", border: "1px solid #1e3a5f" }}>
        <WifiOff className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-slate-500 text-sm">카메라 오프라인</p>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      className="flex-1 w-full rounded-xl bg-black object-contain"
      autoPlay
      muted
      playsInline
      controls
    />
  )
}

// 카메라 코드에 맞는 플레이어 선택
function CameraPlayer({ cameraCode, online, className }: { cameraCode: string; online: boolean; className?: string }) {
  const stream = streamUrl(cameraCode)
  if (stream.type === "mjpeg") {
    return <MjpegPlayer url={stream.url} online={online} className={className} />
  }
  return <HlsPlayer cameraCode={cameraCode} online={online} />
}

// camera_code(예: CAM-A-G-01)에서 구역 이름 추출
function sectionFromCode(code: string): string {
  const parts = code?.split("-") || []
  if (parts.length < 3) return "기타"
  const zone = parts[1]           // A, B
  const floor = parts[2]          // G, B1, B2
  const floorLabel = floor === "G" ? "지상" : "지하"
  return `${zone}동 ${floorLabel}`
}

export default function AdminCCTV() {
  interface CameraItem {
    id: string
    location: string
    section: string
    status: "online" | "offline"
    ip?: string
    model?: string
  }

  const [cameras, setCameras]                 = useState<CameraItem[]>([])
  const [loading, setLoading]                 = useState(false)
  const [selectedSection, setSelectedSection] = useState<string>("전체")
  const [statusFilter, setStatusFilter]       = useState<string>("전체")
  const [fullscreenCamera, setFullscreenCamera] = useState<CameraItem | null>(null)
  const [showAddCamera, setShowAddCamera]     = useState(false)
  const [spotsStats, setSpotsStats]           = useState<{ total: number; occupied: number } | null>(null)
  const [violationCount, setViolationCount]   = useState<number>(0)
  const [forbiddenCars, setForbiddenCars]     = useState<IllegalParkingEntry[]>([])
  const [newCamera, setNewCamera] = useState({
    camera_id: "", location: "", section: "A동 지상", ip: "",
  })

  useEffect(() => {
    fetchAll()
    const timer = setInterval(fetchAll, 30_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchForbidden()
    const timer = setInterval(fetchForbidden, 3_000)
    return () => clearInterval(timer)
  }, [])

  const fetchForbidden = async () => {
    try {
      const forbidden = await getForbiddenOccupied()
      setForbiddenCars(Array.isArray(forbidden) ? forbidden : [])
    } catch {
      // 네트워크 오류 시 기존 상태 유지
    }
  }

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [cameraData, spots, violations] = await Promise.all([
        getCameraStats(),
        getSpotsStats(),
        getOpenViolations(),
      ])

      if (Array.isArray(violations)) setViolationCount(violations.length)
      if (spots?.total != null) setSpotsStats(spots)

      if (cameraData?.cameras?.length > 0) {
        const mapped: CameraItem[] = cameraData.cameras.map((c: Record<string, unknown>) => ({
          id:       String(c.camera_code ?? ""),
          location: String(c.location_desc ?? c.camera_code ?? ""),
          section:  sectionFromCode(String(c.camera_code ?? "")),
          ip:       "N/A",
          model:    "Raspberry Pi Camera",
          status:   c.online ? "online" : "offline",
        }))
        setCameras(mapped)
      } else {
        setCameras([])
      }

    } catch {
      setCameras([])
    } finally {
      setLoading(false)
    }
  }

  const handleAddCamera = async () => {
    alert("카메라 추가는 백엔드 DB에서 직접 등록해주세요.")
    setShowAddCamera(false)
  }

  // 카메라 데이터에서 구역 목록 동적 생성
  const sections = ["전체", ...Array.from(new Set(cameras.map(c => c.section))).sort()]

  let filteredCameras = selectedSection === "전체"
    ? cameras
    : cameras.filter(cam => cam.section === selectedSection)

  if (statusFilter === "온라인")       filteredCameras = filteredCameras.filter(cam => cam.status === "online")
  else if (statusFilter === "오프라인") filteredCameras = filteredCameras.filter(cam => cam.status === "offline")

  const onlineCount  = cameras.filter(cam => cam.status === "online").length
  const offlineCount = cameras.filter(cam => cam.status === "offline").length
  const issueCount   = 0

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0e1a" }}>
      <AdminSidebar />
      <div className="flex-1 p-8">

        {/* 카메라 추가 모달 */}
        {showAddCamera && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(5,10,20,0.95)" }}>
            <div className="rounded-xl p-6 max-w-lg w-full" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <h2 className="text-lg font-semibold mb-4" style={{ color: "#f1f5f9" }}>카메라 추가</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-slate-300 text-sm mb-1 block">카메라 ID</label>
                  <input
                    type="text"
                    value={newCamera.camera_id}
                    onChange={(e) => setNewCamera({ ...newCamera, camera_id: e.target.value })}
                    placeholder="예: CAM-RPI-01"
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: "#0a0e1a", border: "1px solid #1e3a5f", color: "#f1f5f9" }}
                  />
                </div>
                <div>
                  <label className="text-slate-300 text-sm mb-1 block">설치 위치</label>
                  <input
                    type="text"
                    value={newCamera.location}
                    onChange={(e) => setNewCamera({ ...newCamera, location: e.target.value })}
                    placeholder="예: A동 주차장 입구"
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: "#0a0e1a", border: "1px solid #1e3a5f", color: "#f1f5f9" }}
                  />
                </div>
                <div>
                  <label className="text-slate-300 text-sm mb-1 block">구역</label>
                  <select
                    value={newCamera.section}
                    onChange={(e) => setNewCamera({ ...newCamera, section: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: "#0a0e1a", border: "1px solid #1e3a5f", color: "#f1f5f9" }}
                  >
                    <option>A동 지상</option>
                    <option>A동 지하</option>
                    <option>B동 지상</option>
                    <option>B동 지하</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-300 text-sm mb-1 block">IP 주소</label>
                  <input
                    type="text"
                    value={newCamera.ip}
                    onChange={(e) => setNewCamera({ ...newCamera, ip: e.target.value })}
                    placeholder="예: 192.168.1.100"
                    className="w-full px-3 py-2 rounded-lg"
                    style={{ background: "#0a0e1a", border: "1px solid #1e3a5f", color: "#f1f5f9" }}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={handleAddCamera} className="flex-1 py-2 rounded-lg text-white text-sm transition-all hover:brightness-110" style={{ background: "linear-gradient(135deg, #1e40af, #1a56db)" }}>추가</button>
                <button onClick={() => setShowAddCamera(false)} className="px-6 py-2 rounded-lg text-sm transition-all" style={{ background: "#0d1220", border: "1px solid #1e3a5f", color: "#4a6a8a" }}>취소</button>
              </div>
            </div>
          </div>
        )}

        {/* 전체화면 모달 */}
        {fullscreenCamera && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "#050a14" }}>
            <div className="w-full h-full max-w-7xl flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">{fullscreenCamera.location}</h2>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1 rounded-full text-xs" style={{ color: "#93c5fd", background: "rgba(26,86,219,0.2)" }}>{fullscreenCamera.section}</span>
                    <span style={{ color: "#4a6a8a" }}>{fullscreenCamera.id}</span>
                    <span style={{ color: "#4a6a8a" }}>|</span>
                    <span className="font-mono" style={{ color: "#4a6a8a" }}>{fullscreenCamera.ip}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {fullscreenCamera.status === "online" ? (
                    <div className="flex items-center gap-2 bg-green-900/30 border border-green-600/50 px-4 py-2 rounded-lg">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-green-400 font-bold">ONLINE</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-red-900/30 border border-red-600/50 px-4 py-2 rounded-lg">
                      <WifiOff className="w-4 h-4 text-red-400" />
                      <span className="text-red-400 font-bold">OFFLINE</span>
                    </div>
                  )}
                  <button onClick={() => setFullscreenCamera(null)} className="p-2 hover:bg-slate-800 rounded-lg transition-all">
                    <X className="w-6 h-6 transition-colors" style={{ color: "#4a6a8a" }} />
                  </button>
                </div>
              </div>

              {/* 카메라 영상 — min-h-0으로 오버플로 방지 */}
              <div className="flex-1 min-h-0 overflow-hidden rounded-xl">
                <CameraPlayer cameraCode={fullscreenCamera.id} online={fullscreenCamera.status === "online"} className="h-full" />
              </div>

              {/* 주차 현황 인포바 — 항상 표시 */}
              <div className="mt-4 grid grid-cols-4 divide-x overflow-hidden rounded-xl flex-shrink-0" style={{ background: "#0d1220", border: "1px solid #1e3a5f" }}>
                {[
                  { label: "전체 주차면", value: spotsStats?.total ?? "—",                                    valueColor: "#cbd5e1" },
                  { label: "점유 중",    value: spotsStats?.occupied ?? "—",                                   valueColor: "#fb923c" },
                  { label: "빈 자리",    value: spotsStats ? spotsStats.total - spotsStats.occupied : "—",     valueColor: "#4ade80" },
                  { label: "미처리 위반", value: violationCount,                                               valueColor: "#f87171" },
                ].map(({ label, value, valueColor }) => (
                  <div key={label} className="flex flex-col items-center justify-center py-3">
                    <span className="text-xs uppercase tracking-wider mb-1" style={{ color: "#4a6a8a" }}>{label}</span>
                    <span className="text-2xl font-bold" style={{ color: valueColor }}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-xl p-4 flex items-center justify-between" style={{ background: "#0d1220", border: "1px solid #1e3a5f" }}>
                <div className="text-sm font-mono" style={{ color: "#4a6a8a" }}>
                  {new Date().toLocaleString("ko-KR")}
                </div>
                <div className="text-sm">
                  <span style={{ color: "#4a6a8a" }}>모델: </span>
                  <span style={{ color: "#93c5fd" }}>{fullscreenCamera.model}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 불법주차 알림 배너 */}
        {forbiddenCars.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl mb-6 animate-pulse" style={{ background: "rgba(220,38,38,0.12)", border: "1px solid rgba(220,38,38,0.5)" }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: "#f87171" }} />
            <span className="font-semibold text-sm" style={{ color: "#f87171" }}>불법 주차 감지!</span>
            <div className="flex gap-2 flex-wrap">
              {forbiddenCars.map((c) => (
                <span key={c.spot_id} className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: "rgba(220,38,38,0.25)", color: "#fca5a5" }}>
                  {c.type === 'double_parked' ? '[이중주차]' : '[금지구역]'} {c.spot_id}{c.last_plate_text ? ` · ${c.last_plate_text}` : ""}
                </span>
              ))}
            </div>
            <span className="ml-auto text-xs font-semibold" style={{ color: "#f87171" }}>{forbiddenCars.length}건</span>
          </div>
        )}

        {/* 헤더 */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-lg font-semibold mb-1" style={{ color: "#f1f5f9" }}>CCTV 모니터링</h1>
              <p className="text-xs" style={{ color: "#4a6a8a" }}>주차장 실시간 카메라 관리</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => setShowAddCamera(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                카메라 추가
              </button>
              {issueCount > 0 && (
                <button
                  onClick={() => setStatusFilter(statusFilter === "이슈" ? "전체" : "이슈")}
                  className="rounded-xl px-6 py-3 transition-all cursor-pointer hover:scale-105"
                  style={statusFilter === "이슈"
                    ? { background: "rgba(113,63,18,0.4)", border: "2px solid #eab308" }
                    : { background: "rgba(113,63,18,0.15)", border: "1px solid rgba(234,179,8,0.3)" }
                  }
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-yellow-400 animate-pulse" />
                    <span className="text-xs text-yellow-300 font-semibold">이슈</span>
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">{issueCount}건</div>
                </button>
              )}
              <button
                onClick={() => setStatusFilter(statusFilter === "온라인" ? "전체" : "온라인")}
                className="rounded-xl px-6 py-3 transition-all cursor-pointer hover:scale-105"
                style={statusFilter === "온라인"
                  ? { background: "rgba(20,83,45,0.4)", border: "2px solid #22c55e" }
                  : { background: "rgba(20,83,45,0.15)", border: "1px solid rgba(34,197,94,0.3)" }
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <Signal className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-300 font-semibold">온라인</span>
                </div>
                <div className="text-2xl font-bold text-green-400">{onlineCount}대</div>
              </button>
              <button
                onClick={() => setStatusFilter(statusFilter === "오프라인" ? "전체" : "오프라인")}
                className="rounded-xl px-6 py-3 transition-all cursor-pointer hover:scale-105"
                style={statusFilter === "오프라인"
                  ? { background: "rgba(127,29,29,0.4)", border: "2px solid #ef4444" }
                  : { background: "rgba(127,29,29,0.15)", border: "1px solid rgba(239,68,68,0.3)" }
                }
              >
                <div className="flex items-center gap-2 mb-1">
                  <WifiOff className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-300 font-semibold">오프라인</span>
                </div>
                <div className="text-2xl font-bold text-red-400">{offlineCount}대</div>
              </button>
            </div>
          </div>

          {/* 구역 필터 */}
          <div className="flex gap-3">
            {sections.map((section) => (
              <button
                key={section}
                onClick={() => { setSelectedSection(section); setStatusFilter("전체") }}
                className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
                style={selectedSection === section
                  ? { background: "#1a56db", color: "#fff" }
                  : { background: "#0d1220", color: "#4a6a8a", border: "1px solid #1e3a5f" }
                }
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>{section}</span>
                  {section !== "전체" && (
                    <span className="ml-1 text-xs bg-slate-700 px-2 py-0.5 rounded-full">
                      {cameras.filter(cam => cam.section === section).length}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CCTV 그리드 */}
        {loading ? (
          <div className="text-center text-slate-400 py-12">로딩 중...</div>
        ) : filteredCameras.length === 0 ? (
          <div className="rounded-xl p-12 text-center" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
            <Camera className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">해당 구역에 카메라가 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredCameras.map((camera) => {
              const hasForbidden = forbiddenCars.length > 0
              return (
                <div
                  key={camera.id}
                  className="rounded-xl overflow-hidden transition-all shadow-lg"
                  style={{
                    background: "#0d1220",
                    border: `1px solid ${hasForbidden ? "#dc2626" : camera.status === "offline" ? "#dc2626" : "#1e3a5f"}`,
                    borderTop: `2px solid ${hasForbidden ? "#dc2626" : camera.status === "online" ? "#00d4ff" : "#dc2626"}`,
                  }}
                >
                  {/* 실시간 프리뷰 썸네일 */}
                  <div className="relative" style={{ aspectRatio: "16/9", background: "#000" }}>
                    <CameraPlayer cameraCode={camera.id} online={camera.status === "online"} className="h-full object-cover" />
                    {hasForbidden && (
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold animate-pulse" style={{ background: "rgba(220,38,38,0.85)", color: "#fff" }}>
                        <AlertTriangle className="w-3 h-3" />
                        불법주차
                      </div>
                    )}
                  </div>

                  {/* 카메라 정보 */}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="text-white font-semibold text-sm mb-1">{camera.location}</h3>
                        <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">{camera.section}</span>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs mb-3">
                      <div className="flex justify-between">
                        <span className="text-slate-400">IP 주소</span>
                        <span className="text-slate-200 font-mono">{camera.ip}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">모델</span>
                        <span className="text-slate-300">{camera.model}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFullscreenCamera(camera)}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1"
                      >
                        <Maximize2 className="w-3 h-3" />
                        전체화면
                      </button>
                      <button className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-all">
                        설정
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
