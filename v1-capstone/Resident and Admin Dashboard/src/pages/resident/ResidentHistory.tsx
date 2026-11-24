import { useState, useEffect } from "react"
import ResidentBottomNav from "../../components/resident/ResidentBottomNav"
import { History, BarChart2, Clock, MapPin, CalendarDays } from 'lucide-react'
import { useAuth } from "../../hooks/useAuth"
import { resolveUserPlate } from "../../lib/lumi"
import { getParkingHistory, ParkingHistoryEntry, ParkingHistoryResult } from "../../lib/api"

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}분`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatAvg(minutes: number): string {
  if (minutes === 0) return '—'
  if (minutes < 60) return `${minutes}분`
  const h = (minutes / 60).toFixed(1)
  return `${h}h`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function getDateGroupKey(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
}

function groupByDate(history: ParkingHistoryEntry[]): [string, ParkingHistoryEntry[]][] {
  const map = new Map<string, ParkingHistoryEntry[]>()
  for (const entry of history) {
    const key = getDateGroupKey(entry.exited_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries())
}

function thisMonthMinutes(history: ParkingHistoryEntry[]): number {
  const now = new Date()
  return history
    .filter((e) => {
      const d = new Date(e.exited_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    })
    .reduce((sum, e) => sum + e.duration_minutes, 0)
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex-1 text-center">
      <p className="text-blue-400 text-lg font-bold">{value}</p>
      <p className="text-slate-500 text-xs mt-1">{label}</p>
    </div>
  )
}

function HistoryCard({ entry }: { entry: ParkingHistoryEntry }) {
  return (
    <div className="bg-slate-700/50 rounded-xl p-4 border border-slate-600">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          <span className="text-white font-bold">{entry.spot_id}</span>
          {entry.zone && <span className="text-slate-500 text-xs">{entry.zone}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="bg-slate-800 rounded-md px-2 py-1 text-slate-300 text-xs flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(entry.entered_at)} → {formatTime(entry.exited_at)}
        </span>
        <span className="bg-slate-800 rounded-md px-2 py-1 text-green-400 text-xs font-semibold">
          {formatDuration(entry.duration_minutes)}
        </span>
      </div>
    </div>
  )
}

export default function ResidentHistory() {
  const { user } = useAuth()
  const [data, setData] = useState<ParkingHistoryResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const plateNo = await resolveUserPlate(user?.userId, user?.userName)
        const result = await getParkingHistory(plateNo)
        setData(result)
      } catch (err) {
        console.error("주차 이력 로드 실패:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.userId, user?.userName])

  const hasHistory = data && data.history.length > 0
  const groups = hasHistory ? groupByDate(data.history) : []
  const monthMinutes = hasHistory ? thisMonthMinutes(data.history) : 0
  const now = new Date()
  const monthLabel = `${now.getMonth() + 1}월 누적`

  return (
    <div className="pb-20 min-h-screen bg-slate-900">

      <div className="bg-slate-800 p-6 border-b border-slate-700">
        <div className="max-w-screen-md mx-auto">
          <h1 className="text-2xl font-bold text-white">주차 이력</h1>
          <p className="text-slate-400">나의 주차 기록</p>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-slate-400 py-16">로딩 중...</div>
        ) : !hasHistory ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <History className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">주차 이력이 없습니다</p>
            <p className="text-slate-500 text-sm">주차 후 이력이 자동으로 기록됩니다</p>
          </div>
        ) : (
          <>
            {/* 통계 바 */}
            <div className="flex gap-3">
              <StatCard value={`${data.stats.total_count}회`} label="총 이용" />
              <StatCard value={formatAvg(data.stats.avg_minutes)} label="평균 시간" />
              <StatCard value={data.stats.favorite_spot ?? '—'} label="최애 칸" />
            </div>

            {/* 이번 달 누적 */}
            {monthMinutes > 0 && (
              <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-3">
                <CalendarDays className="w-5 h-5 text-purple-400 shrink-0" />
                <div>
                  <p className="text-white font-semibold">{formatDuration(monthMinutes)}</p>
                  <p className="text-slate-500 text-xs">{monthLabel} 총 주차 시간</p>
                </div>
              </div>
            )}

            {/* 날짜 그룹별 이력 */}
            <div className="space-y-4">
              {groups.map(([dateKey, entries]) => (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    <span className="text-blue-400 text-sm font-semibold">{dateKey}</span>
                    <span className="text-slate-600 text-xs">({entries.length}건)</span>
                  </div>
                  <div className="space-y-2">
                    {entries.map((entry, i) => (
                      <HistoryCard key={`${dateKey}-${i}`} entry={entry} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-slate-600 text-xs text-center pb-2">
              최근 {data.history.length}건 표시
            </p>
          </>
        )}
      </div>

      <ResidentBottomNav />
    </div>
  )
}
