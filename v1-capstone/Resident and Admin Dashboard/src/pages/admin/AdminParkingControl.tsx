import { useState, useEffect, useCallback } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import { Car, RefreshCw, LogOut, X } from 'lucide-react'
import {
  getSpotsCurrentStatus,
  adminParkingExit,
  colorEnter,
  colorExit,
  getVehicleSessions,
  SpotStatus,
  VehicleColor,
  VehicleSession,
} from "../../lib/api"

const COLOR_INFO: Record<VehicleColor, { label: string; emoji: string; hex: string }> = {
  red:  { label: '빨간 차', emoji: '🔴', hex: '#ef4444' },
  blue: { label: '파란 차', emoji: '🔵', hex: '#3b82f6' },
  gray: { label: '회색 차', emoji: '⬜', hex: '#94a3b8' },
}

const COLORS: VehicleColor[] = ['red', 'blue', 'gray']

const ENTER_DELAY_SEC = 8 // 입차 후 이 시간(초) 동안 AI 매핑 무시 (팔 오인식 방지)

export default function AdminParkingControl() {
  const [spots, setSpots] = useState<SpotStatus[]>([])
  const [sessions, setSessions] = useState<VehicleSession[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [acting, setActing] = useState(false)
  const [enterTimes, setEnterTimes] = useState<Partial<Record<VehicleColor, number>>>({})
  const [, setTick] = useState(0) // 1초마다 리렌더링 (카운트다운 갱신)

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = useCallback(async () => {
    try {
      const [spotsData, sessionsData] = await Promise.all([
        getSpotsCurrentStatus(),
        getVehicleSessions(),
      ])
      setSpots(spotsData)
      setSessions(sessionsData)
    } catch {
      // 조용히 실패
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  // 1초마다 리렌더링해 카운트다운 숫자 갱신
  useEffect(() => {
    const tick = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  const handleColorEnter = async (color: VehicleColor) => {
    if (acting) return
    setActing(true)
    try {
      const result = await colorEnter(color)
      showToast(`${COLOR_INFO[color].label} 입차 완료 · ${result.name}`)
      setEnterTimes(prev => ({ ...prev, [color]: Date.now() }))
      fetchData()
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace('Backend API failed: ', '') : '입차 실패'
      showToast(msg, false)
    } finally {
      setActing(false)
    }
  }

  const handleColorExit = async (color: VehicleColor) => {
    if (acting) return
    setActing(true)
    try {
      const result = await colorExit(color)
      const notif = result.notified > 0 ? ` · 알림 ${result.notified}건 발송` : ""
      showToast(`${COLOR_INFO[color].label} 출차 완료${notif}`)
      setEnterTimes(prev => { const n = { ...prev }; delete n[color]; return n })
      fetchData()
    } catch {
      showToast(`${COLOR_INFO[color].label} 출차 실패`, false)
    } finally {
      setActing(false)
    }
  }

  const handleForbiddenExit = async (spot_id: string) => {
    if (acting) return
    setActing(true)
    try {
      const result = await adminParkingExit(spot_id)
      const notif = result.notified > 0 ? ` · 알림 ${result.notified}건 발송` : ""
      showToast(`${spot_id} 출차 완료${notif}`)
      fetchData()
    } catch {
      showToast('출차 처리 실패', false)
    } finally {
      setActing(false)
    }
  }

  const parkedSpotMap = new Map<string, VehicleColor>(
    sessions
      .filter(s => s.status === 'parked' && s.spot_id)
      .map(s => [s.spot_id!, s.color])
  )


  const normalSpots = spots.filter(s => s.spot_type_code !== 'forbidden')
  const forbiddenSpots = spots.filter(s => s.spot_type_code === 'forbidden')

  return (
    <div className="flex min-h-screen" style={{ background: '#0a0e1a' }}>
      <AdminSidebar />

      <main className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#f1f5f9' }}>주차 제어</h1>
            <p className="text-sm mt-1" style={{ color: '#4a6a8a' }}>색깔 기반 차량 입출차 · 5초마다 자동 갱신</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all hover:opacity-80"
            style={{ background: '#0d1220', border: '1px solid #1e3a5f', color: '#93c5fd' }}
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>

        {toast && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between"
            style={{
              background: toast.ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`,
              color: toast.ok ? '#34d399' : '#f87171',
            }}
          >
            {toast.msg}
            <button onClick={() => setToast(null)}><X className="w-4 h-4" /></button>
          </div>
        )}

        {loading ? (
          <p className="text-center py-20" style={{ color: '#4a6a8a' }}>불러오는 중...</p>
        ) : (
          <>
            <section className="mb-6">
              <h2 className="text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: '#4a6a8a' }}>
                차량 입출차
              </h2>
              <div className="rounded-xl p-5" style={{ background: '#0d1220', border: '1px solid #1e3a5f' }}>
                <div className="grid grid-cols-3 gap-3">
                  {COLORS.map((color) => {
                    const info = COLOR_INFO[color]
                    const session = sessions.find(s => s.color === color)
                    const status = session?.status
                    const isPending = status === 'pending'
                    const isParkedNow = status === 'parked'
                    const spotId = session?.spot_id

                    // 카운트다운 계산: 입차 후 ENTER_DELAY_SEC초 남은 시간
                    const enterTime = enterTimes[color]
                    const elapsed = enterTime ? Math.floor((Date.now() - enterTime) / 1000) : null
                    const remaining = elapsed !== null ? Math.max(0, ENTER_DELAY_SEC - elapsed) : null
                    const isInDelay = isPending && remaining !== null && remaining > 0

                    return (
                      <div
                        key={color}
                        className="rounded-xl p-4 flex flex-col gap-3"
                        style={{
                          background: isParkedNow ? `${info.hex}10` : isPending ? 'rgba(251,191,36,0.06)' : 'rgba(15,23,42,0.6)',
                          border: `1px solid ${isParkedNow ? info.hex + '44' : isPending ? 'rgba(251,191,36,0.3)' : '#1e3a5f'}`,
                        }}
                      >
                        {/* 차량 정보 헤더 */}
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{info.emoji}</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={isParkedNow
                              ? { background: `${info.hex}22`, color: info.hex }
                              : isPending
                              ? { background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }
                              : { background: 'rgba(74,106,138,0.15)', color: '#4a6a8a' }
                            }
                          >
                            {isParkedNow ? '주차 중' : isPending ? (isInDelay ? '준비 중' : '감지 중') : '대기'}
                          </span>
                        </div>

                        <div>
                          <div className="font-semibold text-sm" style={{ color: '#f1f5f9' }}>{info.label}</div>
                          {isParkedNow && spotId && (
                            <div className="text-xs mt-0.5 font-mono" style={{ color: info.hex }}>{spotId}</div>
                          )}
                          {/* 카운트다운 중: 팔을 빼라는 안내 */}
                          {isInDelay && (
                            <div className="mt-1.5">
                              <div className="text-xs mb-1" style={{ color: '#fbbf24' }}>
                                팔을 빼주세요 — {remaining}초 후 차를 올려주세요
                              </div>
                              <div className="w-full rounded-full h-1.5" style={{ background: 'rgba(251,191,36,0.2)' }}>
                                <div
                                  className="h-1.5 rounded-full transition-all"
                                  style={{
                                    background: '#fbbf24',
                                    width: `${((ENTER_DELAY_SEC - remaining) / ENTER_DELAY_SEC) * 100}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )}
                          {/* 카운트다운 완료: 차 올리라는 안내 */}
                          {isPending && !isInDelay && remaining === 0 && (
                            <div className="text-xs mt-0.5 font-semibold" style={{ color: '#34d399' }}>
                              지금 차를 올려주세요
                            </div>
                          )}
                          {/* 일반 pending (페이지 새로고침 시 enterTime 없는 경우) */}
                          {isPending && remaining === null && (
                            <div className="text-xs mt-0.5" style={{ color: '#fbbf24' }}>칸 감지 대기 중...</div>
                          )}
                        </div>

                        {/* 입차 버튼 */}
                        {!isPending && !isParkedNow && (
                          <button
                            onClick={() => handleColorEnter(color)}
                            disabled={acting}
                            className="w-full py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all hover:opacity-80"
                            style={{ background: `${info.hex}22`, border: `1px solid ${info.hex}55`, color: info.hex }}
                          >
                            입차
                          </button>
                        )}

                        {/* 출차 버튼 (parked) */}
                        {isParkedNow && (
                          <button
                            onClick={() => handleColorExit(color)}
                            disabled={acting}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all hover:opacity-80"
                            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            출차
                          </button>
                        )}

                        {/* 입차 취소 버튼 (pending) */}
                        {isPending && (
                          <button
                            onClick={() => handleColorExit(color)}
                            disabled={acting}
                            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-all hover:opacity-80"
                            style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.4)', color: '#fbbf24' }}
                          >
                            <X className="w-3.5 h-3.5" />
                            입차 취소
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="mb-6">
              <h2 className="text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: '#4a6a8a' }}>
                주차칸 현황 (AI 카메라)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {normalSpots.map((spot) => {
                  const occupied = spot.is_occupied === 1
                  const parkedColor = parkedSpotMap.get(spot.spot_id)
                  return (
                    <div
                      key={spot.spot_id}
                      className="rounded-xl p-5 flex flex-col gap-3"
                      style={{ background: '#0d1220', border: '1px solid #1e3a5f' }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-lg font-mono" style={{ color: '#f1f5f9' }}>
                            {spot.spot_id}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: '#4a6a8a' }}>
                            {spot.zone} 구역
                          </div>
                        </div>
                        <span
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={occupied
                            ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                            : { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                          }
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${occupied ? 'bg-red-400' : 'bg-green-400'}`} />
                          {occupied ? '사용 중' : '비어있음'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Car className="w-4 h-4" style={{ color: '#4a6a8a' }} />
                        <span className="text-sm font-mono" style={{ color: occupied ? '#93c5fd' : '#4a6a8a' }}>
                          {spot.current_plate ?? '—'}
                        </span>
                      </div>

                      {parkedColor && (
                        <div className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded" style={{ background: `${COLOR_INFO[parkedColor].hex}15`, color: COLOR_INFO[parkedColor].hex }}>
                          {COLOR_INFO[parkedColor].emoji} {COLOR_INFO[parkedColor].label}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {forbiddenSpots.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold mb-3 tracking-widest uppercase" style={{ color: '#4a6a8a' }}>
                  금지 구역
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {forbiddenSpots.map((spot) => {
                    const occupied = spot.is_occupied === 1
                    return (
                      <div
                        key={spot.spot_id}
                        className="rounded-xl p-5 flex flex-col gap-3"
                        style={{ background: '#0d1220', border: '1px solid #7f1d1d' }}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-lg font-mono" style={{ color: '#f1f5f9' }}>
                              {spot.spot_id}
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: '#4a6a8a' }}>
                              금지 구역
                            </div>
                          </div>
                          <span
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={occupied
                              ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                              : { background: 'rgba(16,185,129,0.15)', color: '#34d399' }
                            }
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${occupied ? 'bg-red-400' : 'bg-green-400'}`} />
                            {occupied ? '사용 중' : '비어있음'}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Car className="w-4 h-4" style={{ color: '#4a6a8a' }} />
                          <span className="text-sm font-mono" style={{ color: occupied ? '#93c5fd' : '#4a6a8a' }}>
                            {spot.current_plate ?? '—'}
                          </span>
                        </div>

                        {occupied && (
                          <button
                            onClick={() => handleForbiddenExit(spot.spot_id)}
                            disabled={acting}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 transition-all hover:opacity-80"
                            style={{
                              background: 'rgba(239,68,68,0.2)',
                              border: '1px solid rgba(239,68,68,0.4)',
                              color: '#f87171',
                            }}
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            출차
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
