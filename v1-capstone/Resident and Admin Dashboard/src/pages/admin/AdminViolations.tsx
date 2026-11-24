import { useState, useEffect } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import toast from "react-hot-toast"
import { getOpenViolations, resolveViolation, subscribeViolationEvents } from "../../lib/api"

interface Violation {
  _id: string
  car_number: string
  rule_violated: string
  detected_time: string
  confirmed: boolean
}

export default function AdminViolations() {
  const [violations, setViolations] = useState<Violation[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchViolations()

    // SSE로 위반 실시간 수신
    const es = subscribeViolationEvents((data) => {
      if (data.type === "violations_update") {
        const mapped = data.violations.map((v: Record<string, unknown>) => ({
          _id: String(v.id),
          car_number: String(v.plate_text ?? "미확인"),
          rule_violated: v.violation_type === "forbidden_occupied" ? "금지 구역 주차" : "기타 위반",
          detected_time: String(v.created_at ?? ""),
          confirmed: v.status === "resolved",
        }))
        setViolations(mapped)
      }
    })

    // SSE 실패 시 30초 폴링으로 fallback
    es.onerror = () => es.close()
    const timer = setInterval(fetchViolations, 30_000)

    return () => {
      es.close()
      clearInterval(timer)
    }
  }, [])

  const fetchViolations = async () => {
    setLoading(true)
    try {
      const backendData = await getOpenViolations()
      if (Array.isArray(backendData)) {
        setViolations(backendData.map((v: Record<string, unknown>) => ({
          _id: String(v.id),
          car_number: String(v.plate_text ?? "미확인"),
          rule_violated: v.violation_type === "forbidden_occupied" ? "금지 구역 주차" : "기타 위반",
          detected_time: String(v.created_at ?? ""),
          confirmed: v.status === "resolved",
        })))
        setLoading(false)
        return
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.warn("Backend API 실패:", message)
    }
    setViolations([])
    setLoading(false)
  }

  const handleConfirm = async (id: string) => {
    try {
      await resolveViolation(Number(id))
      toast.success("위반 확인 완료")
      fetchViolations()
    } catch {
      toast.error("처리 실패")
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0e1a" }}>
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        {/* TopBar */}
        <div className="flex items-center justify-between px-8 py-4" style={{ background: "#080f1d", borderBottom: "1px solid #1e3a5f" }}>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>불법 주차 관리</h1>
            <p className="text-xs" style={{ color: "#4a6a8a" }}>AI 탐지 위반 차량 목록 및 조치</p>
          </div>
        </div>

        <div className="flex-1 p-8">
          {loading ? (
            <div className="text-center py-12" style={{ color: "#4a6a8a" }}>로딩 중...</div>
          ) : violations.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)" }}>
                <span style={{ color: "#4ade80", fontSize: 24 }}>✓</span>
              </div>
              <p style={{ color: "#4a6a8a" }}>불법 주차 위반 없음</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d1220", borderBottom: "1px solid #1e3a5f" }}>
                    {["차량 번호", "위반 유형", "탐지 시각", "상태", "조치"].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-xs font-semibold tracking-widest" style={{ color: "#4a6a8a" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {violations.map((violation) => (
                    <tr key={violation._id} className="transition-colors" style={{ borderTop: "1px solid #1e3a5f" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#0d1220")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-6 py-4 font-mono font-semibold text-sm" style={{ color: "#f1f5f9" }}>
                        {violation.car_number}
                      </td>
                      <td className="px-6 py-4 text-sm" style={{ color: "#93c5fd" }}>
                        {violation.rule_violated}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono" style={{ color: "#4a6a8a" }}>
                        {new Date(violation.detected_time).toLocaleString("ko-KR")}
                      </td>
                      <td className="px-6 py-4">
                        {violation.confirmed ? (
                          <span className="px-3 py-1 rounded-full text-xs" style={{ border: "1px solid #22c55e", color: "#86efac" }}>확인됨</span>
                        ) : (
                          <span className="px-3 py-1 rounded-full text-xs" style={{ border: "1px solid #eab308", color: "#fde047" }}>미확인</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {!violation.confirmed && (
                          <button
                            onClick={() => handleConfirm(violation._id)}
                            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white transition-all hover:brightness-110"
                            style={{ background: "linear-gradient(135deg, #1e40af, #1a56db)" }}
                          >
                            확인
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}