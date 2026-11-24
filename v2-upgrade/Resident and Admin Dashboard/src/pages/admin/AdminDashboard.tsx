import { useState, useEffect } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import { Car, Camera, AlertTriangle, Users } from 'lucide-react'
import { useNavigate } from "react-router-dom"
import { getOpenViolations, getCameraStats, getSpotsStats, subscribeViolationEvents, healthCheck, getForbiddenOccupied, IllegalParkingEntry } from "../../lib/api"

type ServiceStatus = "ONLINE" | "STANDBY" | "OFFLINE"

interface SystemStatus {
  backend: ServiceStatus
  mysql: ServiceStatus
  rabbitmq: ServiceStatus
  ai: ServiceStatus
  camera: ServiceStatus
}

interface Violation {
  id: number
  plate_text: string | null
  violation_type: string
  created_at: string
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [stats, setStats] = useState({
    totalSpots: 0, occupiedSpots: 0, violations: 0,
    cameras: 0, onlineCount: 0, offlineCount: 0,
  })
  const [recentViolations, setRecentViolations] = useState<Violation[]>([])
  const [forbiddenCars, setForbiddenCars] = useState<IllegalParkingEntry[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    backend: "OFFLINE", mysql: "OFFLINE", rabbitmq: "OFFLINE",
    ai: "STANDBY", camera: "OFFLINE",
  })

  // 시계 업데이트
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const fetchForbidden = async () => {
    try {
      const forbidden = await getForbiddenOccupied()
      setForbiddenCars(Array.isArray(forbidden) ? forbidden : [])
    } catch { /* silent */ }
  }

  useEffect(() => {
    fetchForbidden()
    const timer = setInterval(fetchForbidden, 3_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    fetchStats()
    const es = subscribeViolationEvents((data) => {
      if (data.type === "violations_update") {
        setStats(prev => ({ ...prev, violations: data.count }))
        setRecentViolations(data.violations.slice(0, 5) as unknown as Violation[])
      }
    })
    es.onerror = () => es.close()
    const timer = setInterval(fetchStats, 30_000)
    return () => { es.close(); clearInterval(timer) }
  }, [])

  const fetchStats = async () => {
    // 시스템 상태 체크
    let backendOk = false
    try {
      const health = await healthCheck()
      backendOk = health?.ok === true
    } catch { backendOk = false }

    // 카메라/위반/주차 통계
    try {
      const [violations, cameraStats, spotsStats] = await Promise.all([
        getOpenViolations(), getCameraStats(), getSpotsStats(),
      ])
      setStats({
        totalSpots:    spotsStats?.total    ?? 0,
        occupiedSpots: spotsStats?.occupied ?? 0,
        violations:    Array.isArray(violations) ? violations.length : 0,
        cameras:       cameraStats?.total   ?? 0,
        onlineCount:   cameraStats?.online  ?? 0,
        offlineCount:  cameraStats?.offline ?? 0,
      })
      setRecentViolations(Array.isArray(violations) ? (violations as unknown as Violation[]).slice(0, 5) : [])

      const onlineCount = cameraStats?.online ?? 0
      const totalCameras = cameraStats?.total ?? 0
      setSystemStatus({
        backend:  backendOk ? "ONLINE" : "OFFLINE",
        mysql:    backendOk ? "ONLINE" : "OFFLINE",
        rabbitmq: backendOk ? "ONLINE" : "OFFLINE",
        ai:       onlineCount > 0 ? "ONLINE" : "STANDBY",
        camera:   totalCameras > 0 && onlineCount === 0 ? "OFFLINE"
                : onlineCount > 0 ? "ONLINE" : "STANDBY",
      })
    } catch {
      setSystemStatus({ backend: "OFFLINE", mysql: "OFFLINE", rabbitmq: "OFFLINE", ai: "STANDBY", camera: "STANDBY" })
    }
  }

  const occupancyRate = stats.totalSpots > 0
    ? Math.round(stats.occupiedSpots / stats.totalSpots * 100) : 0

  const statusBadge = (s: ServiceStatus) => {
    const color = ({ ONLINE: "#4ade80", STANDBY: "#fbbf24", OFFLINE: "#f87171" } as Record<ServiceStatus, string>)[s]
    return (
      <span className="flex items-center text-xs font-mono" style={{ color }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full mr-2" style={{ background: color }} />
        {s}
      </span>
    )
  }

  const violationBorderColor = (v: { plate_text?: string | null }) =>
    v.plate_text ? "#dc2626" : "#fbbf24"

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0e1a" }}>
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        {/* TopBar */}
        <div className="flex items-center justify-between px-8 py-4" style={{ background: "#080f1d", borderBottom: "1px solid #1e3a5f" }}>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>관리자 대시보드</h1>
            <p className="text-xs" style={{ color: "#4a6a8a" }}>실시간 주차장 모니터링 및 관리</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", color: "#4ade80" }}>
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#4ade80" }} />
            LIVE · {now.toLocaleTimeString("ko-KR")}
          </div>
        </div>

        {/* 불법주차 알림 배너 */}
        {forbiddenCars.length > 0 && (
          <div className="flex items-center gap-3 px-6 py-3 animate-pulse" style={{ background: "rgba(220,38,38,0.15)", borderBottom: "1px solid rgba(220,38,38,0.5)" }}>
            <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: "#f87171" }} />
            <span className="font-semibold text-sm" style={{ color: "#f87171" }}>불법 주차 감지!</span>
            <div className="flex gap-2 flex-wrap">
              {forbiddenCars.map((c) => (
                <span key={c.spot_id} className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: "rgba(220,38,38,0.3)", color: "#fca5a5" }}>
                  {c.type === 'double_parked' ? '[이중주차]' : '[금지구역]'} {c.spot_id}{c.last_plate_text ? ` · ${c.last_plate_text}` : ""}
                </span>
              ))}
            </div>
            <span className="ml-auto text-xs" style={{ color: "#f87171" }}>
              {forbiddenCars.length}건
            </span>
          </div>
        )}

        <div className="flex-1 p-8">
          {/* 통계 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {/* 주차 현황 */}
            <div className="rounded-xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #0c2461, #1a56db)", boxShadow: "0 4px 20px rgba(26,86,219,0.3)" }}>
              <div className="flex items-center justify-between mb-3">
                <Car className="w-6 h-6" style={{ color: "#93c5fd" }} />
                <span className="text-xs tracking-widest" style={{ color: "#93c5fd" }}>주차 현황</span>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "#fff" }}>
                {stats.occupiedSpots}<span className="text-lg opacity-50">/{stats.totalSpots}</span>
              </div>
              <div className="h-1 rounded-full mb-2" style={{ background: "rgba(0,0,0,0.25)" }}>
                <div className="h-full rounded-full" style={{ width: `${occupancyRate}%`, background: "rgba(255,255,255,0.5)" }} />
              </div>
              <div className="text-xs" style={{ color: "#93c5fd" }}>점유율 {occupancyRate}%</div>
            </div>

            {/* 위반 */}
            <div className="rounded-xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)", boxShadow: "0 4px 20px rgba(220,38,38,0.3)" }}>
              <div className="flex items-center justify-between mb-3">
                <AlertTriangle className="w-6 h-6" style={{ color: "#fca5a5" }} />
                <span className="text-xs tracking-widest" style={{ color: "#fca5a5" }}>미처리 위반</span>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "#fff" }}>
                {stats.violations}<span className="text-lg opacity-50">건</span>
              </div>
              <div className="text-xs" style={{ color: "#fca5a5" }}>
                {stats.violations > 0 ? "● 즉시 조치 필요" : "● 이상 없음"}
              </div>
            </div>

            {/* CCTV */}
            <div className="rounded-xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #164e63, #0891b2)", boxShadow: "0 4px 20px rgba(8,145,178,0.3)" }}>
              <div className="flex items-center justify-between mb-3">
                <Camera className="w-6 h-6" style={{ color: "#a5f3fc" }} />
                <span className="text-xs tracking-widest" style={{ color: "#a5f3fc" }}>CCTV</span>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "#fff" }}>
                {stats.cameras}<span className="text-lg opacity-50">대</span>
              </div>
              <div className="flex items-center gap-3 text-xs" style={{ color: "#a5f3fc" }}>
                <span style={{ color: "#6ee7b7" }}>● 온라인 {stats.onlineCount}</span>
                {stats.offlineCount > 0 && <span style={{ color: "#fca5a5" }}>● 오프라인 {stats.offlineCount}</span>}
              </div>
            </div>

            {/* 방문자 */}
            <div className="rounded-xl p-5 shadow-lg" style={{ background: "linear-gradient(135deg, #14532d, #16a34a)", boxShadow: "0 4px 20px rgba(22,163,74,0.3)" }}>
              <div className="flex items-center justify-between mb-3">
                <Users className="w-6 h-6" style={{ color: "#bbf7d0" }} />
                <span className="text-xs tracking-widest" style={{ color: "#bbf7d0" }}>방문자 대기</span>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: "#fff" }}>
                0<span className="text-lg opacity-50">건</span>
              </div>
              <div className="text-xs" style={{ color: "#86efac" }}>● 대기 없음</div>
            </div>
          </div>

          {/* 하단 패널 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 최근 위반 */}
            <div className="rounded-xl p-5" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: "#f87171" }} />
                  <h2 className="text-sm font-semibold tracking-widest" style={{ color: "#93c5fd" }}>최근 위반 · RECENT ALERTS</h2>
                </div>
                <button onClick={() => navigate("/admin/violations")} className="text-xs transition-colors" style={{ color: "#1a56db" }}>전체 보기 →</button>
              </div>
              <div className="space-y-2">
                {recentViolations.length === 0 ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-md" style={{ background: "#0a0e1a" }}>
                    <span className="text-sm" style={{ color: "#4a6a8a" }}>미처리 위반 없음</span>
                    <span className="text-xs" style={{ color: "#4ade80" }}>● 정상</span>
                  </div>
                ) : (
                  recentViolations.map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2.5 rounded-md" style={{ background: "#0a0e1a", borderLeft: `2px solid ${violationBorderColor(v)}` }}>
                      <div>
                        <span className="font-mono font-semibold text-sm" style={{ color: "#f1f5f9" }}>{v.plate_text || "미 확 인"}</span>
                        <span className="text-xs ml-2" style={{ color: v.plate_text ? "#f87171" : "#fbbf24" }}>
                          {v.violation_type === "forbidden_occupied" ? "금지 구역 주차" : "위반"}
                        </span>
                      </div>
                      <span className="text-xs font-mono" style={{ color: "#4a6a8a" }}>
                        {new Date(v.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 시스템 상태 */}
            <div className="rounded-xl p-5" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full" style={{ background: "#4ade80" }} />
                <h2 className="text-sm font-semibold tracking-widest" style={{ color: "#93c5fd" }}>시스템 상태 · SYSTEM STATUS</h2>
              </div>
              <div className="space-y-1.5">
                {([
                  ["백엔드 API",  systemStatus.backend],
                  ["MySQL DB",   systemStatus.mysql],
                  ["RabbitMQ",   systemStatus.rabbitmq],
                  ["AI 서비스",  systemStatus.ai],
                  [`카메라 (${stats.onlineCount}/${stats.cameras})`, systemStatus.camera],
                ] as [string, ServiceStatus][]).map(([name, status]) => (
                  <div key={name} className="flex items-center justify-between px-3 py-2 rounded-md" style={{ background: "#0a0e1a" }}>
                    <span className="font-mono text-sm" style={{ color: "#93c5fd" }}>{name}</span>
                    {statusBadge(status)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
