import { useState, useEffect } from "react"
import ResidentBottomNav from "../../components/resident/ResidentBottomNav"
import { Users, Plus, X, Car, Calendar, Clock, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from "../../hooks/useAuth"
import { getMyVisitors, createVisitor, VisitorPass } from "../../lib/api"

const STATUS_LABEL: Record<VisitorPass['status'], string> = {
  pending:  '승인 대기',
  approved: '승인됨',
  rejected: '거절됨',
}

const STATUS_COLOR: Record<VisitorPass['status'], string> = {
  pending:  'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
  approved: 'text-green-400 bg-green-400/10 border-green-400/30',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/30',
}

function StatusBadge({ status }: { status: VisitorPass['status'] }) {
  const Icon = status === 'approved' ? CheckCircle : status === 'rejected' ? XCircle : Loader2
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border ${STATUS_COLOR[status]}`}>
      <Icon className="w-3 h-3" />
      {STATUS_LABEL[status]}
    </span>
  )
}

function formatVisitDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
}

interface FormState {
  visitor_name: string
  plate_no: string
  visit_date: string
  visit_time: string
  purpose: string
}

const INITIAL_FORM: FormState = {
  visitor_name: '',
  plate_no: '',
  visit_date: new Date().toISOString().slice(0, 10),
  visit_time: '',
  purpose: '',
}

export default function ResidentVisitors() {
  const { user } = useAuth()
  const [visitors, setVisitors] = useState<VisitorPass[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadVisitors = async () => {
    if (!user?.userName) return
    try {
      const data = await getMyVisitors(user.userName)
      setVisitors(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error("방문자 목록 로드 실패:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVisitors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.userName])

  const handleSubmit = async () => {
    if (!form.visitor_name.trim()) { setError("방문자 이름을 입력해주세요"); return }
    if (!form.visit_date) { setError("방문 날짜를 선택해주세요"); return }
    if (!user?.userName) { setError("로그인 정보를 확인해주세요"); return }

    setSubmitting(true)
    setError(null)
    try {
      await createVisitor({
        visitor_name: form.visitor_name.trim(),
        plate_no: form.plate_no.trim() || undefined,
        visit_date: form.visit_date,
        visit_time: form.visit_time.trim() || undefined,
        purpose: form.purpose.trim() || undefined,
        host_name: user.userName,
      })
      setShowModal(false)
      setForm(INITIAL_FORM)
      setLoading(true)
      await loadVisitors()
    } catch (err) {
      setError("등록에 실패했습니다. 다시 시도해주세요.")
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="pb-20 min-h-screen bg-slate-900">

      <div className="bg-slate-800 p-6 border-b border-slate-700">
        <div className="max-w-screen-md mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">방문자 관리</h1>
            <p className="text-slate-400">등록된 방문자 목록</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setError(null) }}
            className="p-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-white transition-all active:scale-95"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center text-slate-400 py-16">로딩 중...</div>
        ) : visitors.length === 0 ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">등록된 방문자가 없습니다</p>
            <p className="text-slate-500 text-sm">우측 상단 + 버튼으로 방문자를 등록해보세요</p>
          </div>
        ) : (
          visitors.map((v) => (
            <div key={v.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white font-bold text-base">{v.visitor_name}</p>
                  {v.purpose && <p className="text-slate-400 text-sm mt-0.5">{v.purpose}</p>}
                </div>
                <StatusBadge status={v.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1.5 text-slate-400 text-xs bg-slate-700 rounded-lg px-2.5 py-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatVisitDate(v.visit_date)}
                </span>
                {v.visit_time && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-xs bg-slate-700 rounded-lg px-2.5 py-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {v.visit_time}
                  </span>
                )}
                {v.plate_no && (
                  <span className="flex items-center gap-1.5 text-slate-400 text-xs bg-slate-700 rounded-lg px-2.5 py-1.5">
                    <Car className="w-3.5 h-3.5" />
                    {v.plate_no}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end justify-center" onClick={() => setShowModal(false)}>
          <div
            className="bg-slate-800 rounded-t-2xl w-full max-w-screen-md p-6 space-y-4 border-t border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">방문자 등록</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* 방문자 이름 */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">방문자 이름 *</label>
                <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-3 py-3 border border-slate-600">
                  <Users className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="홍길동"
                    value={form.visitor_name}
                    onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
                    className="bg-transparent text-white placeholder-slate-500 outline-none flex-1 text-sm"
                  />
                </div>
              </div>

              {/* 차량 번호 */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">차량 번호 (선택)</label>
                <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-3 py-3 border border-slate-600">
                  <Car className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="12가3456"
                    value={form.plate_no}
                    onChange={(e) => setForm({ ...form, plate_no: e.target.value })}
                    className="bg-transparent text-white placeholder-slate-500 outline-none flex-1 text-sm"
                  />
                </div>
              </div>

              {/* 방문 날짜 */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">방문 날짜 *</label>
                <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-3 py-3 border border-slate-600">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={form.visit_date}
                    onChange={(e) => setForm({ ...form, visit_date: e.target.value })}
                    className="bg-transparent text-white outline-none flex-1 text-sm"
                  />
                </div>
              </div>

              {/* 방문 시간 */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">방문 시간대 (선택)</label>
                <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-3 py-3 border border-slate-600">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="14:00 ~ 18:00"
                    value={form.visit_time}
                    onChange={(e) => setForm({ ...form, visit_time: e.target.value })}
                    className="bg-transparent text-white placeholder-slate-500 outline-none flex-1 text-sm"
                  />
                </div>
              </div>

              {/* 방문 목적 */}
              <div>
                <label className="text-slate-400 text-xs mb-1 block">방문 목적 (선택)</label>
                <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-3 py-3 border border-slate-600">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="가족 방문"
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    className="bg-transparent text-white placeholder-slate-500 outline-none flex-1 text-sm"
                  />
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {submitting ? '등록 중...' : '등록 완료'}
            </button>
          </div>
        </div>
      )}

      <ResidentBottomNav />
    </div>
  )
}
