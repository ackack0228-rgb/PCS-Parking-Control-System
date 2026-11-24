import { useState, useEffect } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import { UserCheck, Clock, CheckCircle, XCircle } from "lucide-react"
import { getPendingVisitors, approveVisitor, rejectVisitor } from "../../lib/api"
import { lumi } from "../../lib/lumi"
import toast from "react-hot-toast"

interface VisitorPass {
  id: string
  visitor_name: string
  plate_no: string
  visit_date: string
  visit_time: string
  expiration_at: string
  purpose?: string
  host_name?: string
  building?: string
  unit_no?: string
}

export default function AdminVisitors() {
  const [visitors, setVisitors] = useState<VisitorPass[]>([])
  const [loading, setLoading] = useState(true)
  // 백엔드 연결 여부 추적 (fallback 시 Lumi ID 사용)
  const [isBackend, setIsBackend] = useState(false)

  useEffect(() => {
    fetchVisitors()
  }, [])

  const fetchVisitors = async () => {
    setLoading(true)
    try {
      const data = await getPendingVisitors()
      if (Array.isArray(data)) {
        setVisitors(data.map((v: Record<string, unknown>) => ({
          id: String(v.id),
          visitor_name: String(v.visitor_name ?? ""),
          plate_no: String(v.plate_no ?? "미등록"),
          visit_date: String(v.visit_date ?? ""),
          visit_time: String(v.visit_time ?? "-"),
          expiration_at: String(v.expiration_at ?? ""),
          purpose: v.purpose !== undefined ? String(v.purpose) : undefined,
          host_name: v.host_name !== undefined ? String(v.host_name) : undefined,
          building: v.building !== undefined ? String(v.building) : undefined,
          unit_no: v.unit_no !== undefined ? String(v.unit_no) : undefined,
        })))
        setIsBackend(true)
        setLoading(false)
        return
      }
    } catch {
      // fallback: Lumi SDK
    }

    try {
      const { list } = await lumi.entities.visitor.list({
        filter: { approval_status: "pending" },
        limit: 100,
      })
      setVisitors(list.map((v: Record<string, unknown>) => ({
        id: String(v._id ?? ""),
        visitor_name: String(v.visitor_name ?? ""),
        plate_no: String(v.car_number ?? "미등록"),
        visit_date: String(v.visit_date ?? ""),
        visit_time: String(v.visit_time ?? "-"),
        expiration_at: String(v.expiration_time ?? ""),
      })))
      setIsBackend(false)
    } catch {
      setVisitors([])
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    try {
      if (isBackend) {
        await approveVisitor(Number(id))
      } else {
        await lumi.entities.visitor.update(id, { approval_status: "approved" })
      }
      toast.success("방문자 승인 완료")
      fetchVisitors()
    } catch {
      toast.error("승인 실패")
    }
  }

  const handleReject = async (id: string) => {
    try {
      if (isBackend) {
        await rejectVisitor(Number(id))
      } else {
        await lumi.entities.visitor.update(id, { approval_status: "rejected" })
      }
      toast.success("방문자 거절 완료")
      fetchVisitors()
    } catch {
      toast.error("거절 실패")
    }
  }

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0e1a" }}>
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        {/* TopBar */}
        <div className="flex items-center justify-between px-8 py-4" style={{ background: "#080f1d", borderBottom: "1px solid #1e3a5f" }}>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>방문자 승인</h1>
            <p className="text-xs" style={{ color: "#4a6a8a" }}>입주민이 등록한 방문자 출입증 승인 관리</p>
          </div>
          {visitors.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono" style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", color: "#fbbf24" }}>
              <Clock className="w-3 h-3" />
              대기 {visitors.length}건
            </span>
          )}
        </div>

        <div className="flex-1 p-8">
          {loading ? (
            <div className="text-center py-12 text-sm" style={{ color: "#4a6a8a" }}>로딩 중...</div>
          ) : visitors.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)" }}>
                <UserCheck className="w-6 h-6" style={{ color: "#4ade80" }} />
              </div>
              <p className="text-sm" style={{ color: "#4a6a8a" }}>승인 대기 중인 방문자가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {visitors.map((v) => (
                <div key={v.id} className="rounded-xl p-5" style={{ background: "#080f1d", border: "1px solid #1e3a5f", borderTop: "2px solid #fbbf24" }}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-base mb-1" style={{ color: "#f1f5f9" }}>{v.visitor_name}</h3>
                      <span className="font-mono text-sm" style={{ color: "#93c5fd" }}>{v.plate_no}</span>
                      {v.purpose && (
                        <p className="text-xs mt-1" style={{ color: "#4a6a8a" }}>{v.purpose}</p>
                      )}
                    </div>
                    <Clock className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "#fbbf24" }} />
                  </div>

                  <div className="space-y-1.5 mb-4 text-xs" style={{ color: "#4a6a8a" }}>
                    <div className="flex justify-between">
                      <span>방문 날짜</span>
                      <span style={{ color: "#93c5fd" }}>{new Date(v.visit_date).toLocaleDateString("ko-KR")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>방문 시간</span>
                      <span style={{ color: "#93c5fd" }}>{v.visit_time}</span>
                    </div>
                    {v.expiration_at && (
                      <div className="flex justify-between">
                        <span>만료 시각</span>
                        <span style={{ color: "#93c5fd" }}>{new Date(v.expiration_at).toLocaleString("ko-KR")}</span>
                      </div>
                    )}
                    {v.host_name && (
                      <div className="flex justify-between">
                        <span>초대한 입주민</span>
                        <span style={{ color: "#93c5fd" }}>
                          {v.host_name}{v.building && v.unit_no ? ` (${v.building} ${v.unit_no})` : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(v.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all hover:brightness-110"
                      style={{ background: "linear-gradient(135deg, #14532d, #16a34a)", color: "#fff" }}
                    >
                      <CheckCircle className="w-4 h-4" />
                      승인
                    </button>
                    <button
                      onClick={() => handleReject(v.id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-all hover:brightness-110"
                      style={{ background: "linear-gradient(135deg, #7f1d1d, #dc2626)", color: "#fff" }}
                    >
                      <XCircle className="w-4 h-4" />
                      거절
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
