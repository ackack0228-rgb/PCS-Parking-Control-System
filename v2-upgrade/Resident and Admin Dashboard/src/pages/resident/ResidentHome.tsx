import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import ResidentBottomNav from "../../components/resident/ResidentBottomNav"
import { Car, MapPin, AlertCircle, TrendingUp, BarChart2, X, Bell } from 'lucide-react'
import { resolveUserPlate } from "../../lib/lumi"
import {
  getSpotsStats,
  getSpotPreference,
  getNotifications,
  dismissNotification,
  SpotPreferenceResult,
  ParkingNotification,
} from "../../lib/api"
import { useAuth } from "../../hooks/useAuth"

function makeChimeWav(): string {
  const sampleRate = 44100
  const tones = [
    { freq: 523, start: 0,    dur: 0.15 },
    { freq: 659, start: 0.15, dur: 0.15 },
    { freq: 784, start: 0.3,  dur: 0.25 },
  ]
  const totalSamples = Math.ceil(0.55 * sampleRate)
  const pcm = new Float32Array(totalSamples)
  for (const { freq, start, dur } of tones) {
    const s0 = Math.floor(start * sampleRate)
    const s1 = Math.min(Math.floor((start + dur) * sampleRate), totalSamples)
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / sampleRate
      pcm[i] += 0.3 * Math.exp(-4 * t / dur) * Math.sin(2 * Math.PI * freq * t)
    }
  }
  const dataBytes = totalSamples * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const v = new DataView(buf)
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataBytes, true); ws(8, 'WAVE')
  ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dataBytes, true)
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export default function ResidentHome() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [plateNo, setPlateNo] = useState<string>('')
  const [parkingStats, setParkingStats] = useState({ total: 3, occupied: 0, available: 3 })
  const [spotPreference, setSpotPreference] = useState<SpotPreferenceResult | null>(null)
  const [notification, setNotification] = useState<ParkingNotification | null>(null)
  const [audioReady, setAudioReady] = useState(false) // 소리 잠금 해제 여부
  const shownNotifIds = useRef<Set<number>>(new Set())
  const chimeRef = useRef<HTMLAudioElement | null>(null)
  const chimeUrlRef = useRef<string>(makeChimeWav()) // WAV Blob URL — 한 번만 생성

  // "소리 켜기" 버튼 탭 → Audio 잠금 해제 (iOS/Android 모두 사용자 제스처 필요)
  const handleEnableAudio = useCallback(() => {
    const audio = new Audio(chimeUrlRef.current)
    audio.volume = 0.001
    audio.play()
      .then(() => { audio.pause(); audio.currentTime = 0; audio.volume = 1 })
      .catch(() => {})
    chimeRef.current = audio
    setAudioReady(true)
  }, [])

  // ── 함수 선언 (useEffect 참조 전에 배치) ──────────────────

  const fetchParkingStats = useCallback(async () => {
    try {
      const data = await getSpotsStats() as { total: number; occupied: number }
      if (data.total > 0) {
        setParkingStats({ total: data.total, occupied: data.occupied, available: data.total - data.occupied })
      }
    } catch (error) {
      console.error("주차 통계 로드 실패:", error)
    }
  }, [])

  const fetchSpotPreference = useCallback(async (pn: string) => {
    try {
      const result = await getSpotPreference(pn)
      setSpotPreference(result)
    } catch (error) {
      console.error("선호 주차칸 로드 실패:", error)
    }
  }, [])

  const playChime = useCallback(() => {
    // 사용자가 "소리 켜기"를 탭한 후 활성화된 Audio 요소로 재생
    // iOS/Android Chrome은 사용자 제스처로 잠금 해제된 같은 요소만 타이머에서 재생 가능
    if (chimeRef.current) {
      chimeRef.current.currentTime = 0
      chimeRef.current.play().catch(() => {})
    }
  }, [])

  const fetchNotification = useCallback(async (plate: string) => {
    try {
      const list = await getNotifications(plate)
      const unseenList = list.filter((n) => !shownNotifIds.current.has(n.id))
      if (unseenList.length === 0) return
      unseenList.forEach((n) => shownNotifIds.current.add(n.id))
      setNotification(unseenList[0])
      setTimeout(() => setNotification(null), 10000)
      if (navigator.vibrate) navigator.vibrate([200, 100, 200])
      playChime()
    } catch (err) {
      console.error('[알림 폴링 오류]', err)
    }
  }, [playChime])

  // ── useEffect (함수 선언 이후에 배치) ──────────────────────

  // 번호판 한 번만 조회 → plateNo state에 저장
  useEffect(() => {
    resolveUserPlate(user?.userId, user?.userName).then(setPlateNo)
  }, [user?.userId, user?.userName])

  // 주차 통계 + 선호 주차칸: 10초 폴링
  useEffect(() => {
    if (!plateNo) return
    fetchParkingStats()
    fetchSpotPreference(plateNo)
    const interval = setInterval(() => {
      fetchParkingStats()
      fetchSpotPreference(plateNo)
    }, 10000)
    return () => clearInterval(interval)
  }, [plateNo, fetchParkingStats, fetchSpotPreference])

  // 알림만 3초 빠른 폴링
  useEffect(() => {
    if (!plateNo) return
    fetchNotification(plateNo)
    const interval = setInterval(() => fetchNotification(plateNo), 3000)
    return () => clearInterval(interval)
  }, [plateNo, fetchNotification])

  const handleDismiss = async () => {
    if (!notification) return
    try { await dismissNotification(notification.id) } catch { /* 조용히 실패 */ }
    setNotification(null)
  }

  const occupancyRate = parkingStats.total > 0
    ? (parkingStats.occupied / parkingStats.total * 100).toFixed(0)
    : 0

  return (
    <div className="pb-20 min-h-screen">
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6">
        <div className="max-w-screen-md mx-auto">
          <h1 className="text-2xl font-bold text-white mb-1">주차 관리</h1>
          <p className="text-blue-100">안녕하세요, {user?.userName}님</p>
        </div>
      </div>

      {/* 소리 잠금 해제 안내 (탭 전까지 표시) */}
      {!audioReady && (
        <button
          onClick={handleEnableAudio}
          className="w-full px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-semibold transition-colors active:opacity-70"
          style={{ background: '#1e3a5f', color: '#93c5fd' }}
        >
          <Bell className="w-4 h-4" />
          알림 소리 켜기 — 여기를 탭하세요
        </button>
      )}

      {/* 입차 알림 배너 */}
      {notification && (
        <div className="bg-green-600 px-4 py-3">
          <div className="max-w-screen-md mx-auto flex items-center gap-3">
            <Bell className="w-5 h-5 text-white shrink-0 animate-bounce" />
            <p className="flex-1 text-white font-semibold text-sm">{notification.message}</p>
            <button onClick={handleDismiss} className="text-green-100 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-screen-md mx-auto p-4 space-y-4">
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">실시간 주차 현황</h2>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{parkingStats.total}</div>
              <div className="text-slate-400 text-sm">전체</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{parkingStats.occupied}</div>
              <div className="text-slate-400 text-sm">주차 중</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{parkingStats.available}</div>
              <div className="text-slate-400 text-sm">빈자리</div>
            </div>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-600 to-blue-400 h-3 rounded-full transition-all"
              style={{ width: `${occupancyRate}%` }}
            />
          </div>
          <p className="text-center text-slate-400 text-sm mt-2">점유율: {occupancyRate}%</p>
        </div>

        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">내 선호 주차칸</h2>
            <BarChart2 className="w-5 h-5 text-blue-400" />
          </div>
          {!spotPreference || spotPreference.preferred_spots.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-4">아직 주차 이력이 없습니다</p>
          ) : (
            <div className="space-y-4">
              {spotPreference.preferred_spots.slice(0, 3).map((spot, i) => (
                <div key={spot.spot_id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white font-medium">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {i + 1}위&nbsp; {spot.spot_id}
                    </span>
                    <span className="text-blue-400 font-bold">{spot.percentage}%</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                    <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${spot.percentage}%` }} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${spot.is_available ? 'bg-green-400' : 'bg-red-400'}`} />
                    <span className={`text-xs font-semibold ${spot.is_available ? 'text-green-400' : 'text-red-400'}`}>
                      {spot.is_available ? '현재 비어있음' : '현재 사용 중'}
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-slate-500 text-xs text-center border-t border-slate-700 pt-3">
                최근 총 {spotPreference.total_visits}회 이용
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/resident/vehicle")}
            className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all active:scale-95 text-left"
          >
            <Car className="w-8 h-8 text-white mb-3" />
            <h3 className="text-white font-semibold mb-1">내 차량</h3>
            <p className="text-blue-100 text-sm">차량 정보 확인</p>
          </button>
          <button
            onClick={() => navigate("/resident/parking")}
            className="bg-gradient-to-br from-purple-600 to-purple-500 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all active:scale-95 text-left"
          >
            <MapPin className="w-8 h-8 text-white mb-3" />
            <h3 className="text-white font-semibold mb-1">주차 위치</h3>
            <p className="text-purple-100 text-sm">실시간 위치 확인</p>
          </button>
        </div>

        <div className="bg-slate-800 rounded-xl p-4 border border-yellow-900">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-white font-semibold mb-1">공지사항</h3>
              <p className="text-slate-300 text-sm">
                주차장 시설 점검이 예정되어 있습니다. 자세한 내용은 관리실로 문의해주세요.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ResidentBottomNav />
    </div>
  )
}
