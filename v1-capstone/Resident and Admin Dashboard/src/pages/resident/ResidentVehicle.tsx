import { useState, useEffect } from "react"
import ResidentBottomNav from "../../components/resident/ResidentBottomNav"
import { MapPin, Car, Clock, Navigation, BarChart2 } from 'lucide-react'
import { useAuth } from "../../hooks/useAuth"
import { resolveUserPlate, formatElapsedTime } from "../../lib/lumi"
import { getSpotPreference, getVehicleSessions, SpotPreferenceResult } from "../../lib/api"

interface ParkingSpot {
  spot_id: string
  section: string
  position: number
  car_number: string
  entry_time: string
  floor: string
  zone: string
}

export default function ResidentVehicle() {
  const { user } = useAuth()
  const [currentParking, setCurrentParking] = useState<ParkingSpot | null>(null)
  const [loading, setLoading] = useState(true)
  const [spotPreference, setSpotPreference] = useState<SpotPreferenceResult | null>(null)
  const [plateNo, setPlateNo] = useState('')

  const fetchSpotPreference = async (plateNo: string) => {
    try {
      const result = await getSpotPreference(plateNo)
      setSpotPreference(result)
    } catch (error) {
      console.error("선호 주차칸 로드 실패:", error)
    }
  }

  const fetchCurrentParking = async (plateNo: string) => {
    try {
      const sessions = await getVehicleSessions()
      const session = sessions.find(s => s.plate_no === plateNo && s.status === 'parked')
      if (session?.spot_id) {
        const [zone] = session.spot_id.split('-')
        setCurrentParking({
          spot_id: session.spot_id,
          section: `${zone} 구역`,
          position: 0,
          car_number: plateNo,
          entry_time: session.entered_at,
          floor: '지상',
          zone: `${zone} 구역`,
        })
      } else {
        setCurrentParking(null)
      }
    } catch (error) {
      console.error("주차 위치 로드 실패:", error)
      setCurrentParking(null)
    } finally {
      setLoading(false)
    }
  }

  // 마운트 1회: 번호판 조회
  useEffect(() => {
    resolveUserPlate(user?.userId, user?.userName).then(setPlateNo)
  }, [user?.userId, user?.userName])

  // 10초 폴링 (번호판 확정 후)
  useEffect(() => {
    if (!plateNo) return
    fetchCurrentParking(plateNo)
    fetchSpotPreference(plateNo)
    const interval = setInterval(() => {
      fetchCurrentParking(plateNo)
      fetchSpotPreference(plateNo)
    }, 10000)
    return () => clearInterval(interval)
  }, [plateNo])

  return (
    <div className="pb-20 min-h-screen bg-slate-900">
      <div className="bg-slate-800 p-6 border-b border-slate-700">
        <div className="max-w-screen-md mx-auto">
          <h1 className="text-2xl font-bold text-white">내 차량</h1>
          <p className="text-slate-400">내 차량의 실시간 위치</p>
        </div>
      </div>

      <div className="max-w-screen-md mx-auto p-4 space-y-4">
        {loading ? (
          <div className="text-center text-slate-400 py-12">로딩 중...</div>
        ) : !currentParking ? (
          <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700">
            <Car className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 mb-2">현재 주차 중인 차량이 없습니다</p>
            <p className="text-slate-500 text-sm">차량이 입차하면 위치가 표시됩니다</p>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <MapPin className="w-8 h-8 text-white" />
                  <div>
                    <h2 className="text-2xl font-bold text-white">
                      {currentParking.spot_id || currentParking.section}
                    </h2>
                    <p className="text-blue-100">{currentParking.section}</p>
                  </div>
                </div>
                <Navigation className="w-6 h-6 text-white" />
              </div>
              <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
                <p className="text-white text-sm mb-1">차량 번호</p>
                <p className="text-white text-2xl font-bold">{currentParking.car_number}</p>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 space-y-4">
              <h3 className="text-lg font-semibold text-white mb-3">주차 정보</h3>
              <div className="flex items-center justify-between py-3 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-400" />
                  <span className="text-slate-400">구역</span>
                </div>
                <span className="text-white font-medium">{currentParking.section}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-purple-400" />
                  <span className="text-slate-400">주차칸</span>
                </div>
                <span className="text-white font-medium">
                  {currentParking.spot_id}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-slate-700">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-green-400" />
                  <span className="text-slate-400">입차 시간</span>
                </div>
                <span className="text-white font-medium">
                  {new Date(currentParking.entry_time).toLocaleString("ko-KR", {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-yellow-400" />
                  <span className="text-slate-400">주차 시간</span>
                </div>
                <span className="text-white font-medium">{formatElapsedTime(currentParking.entry_time)}</span>
              </div>
            </div>

            <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">주차칸 분석</h3>
                <BarChart2 className="w-5 h-5 text-blue-400" />
              </div>
              {!spotPreference || spotPreference.preferred_spots.length === 0 ? (
                <div className="text-center py-6">
                  <BarChart2 className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">아직 주차 이력이 없습니다</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {spotPreference.preferred_spots.slice(0, 3).map((spot, i) => (
                    <div key={spot.spot_id} className="bg-slate-700 rounded-lg p-4">
                      <div className="flex items-end justify-between mb-2">
                        <div>
                          <p className="text-slate-400 text-xs mb-1">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} {i + 1}위 선호 주차칸
                          </p>
                          <p className="text-white text-xl font-bold">{spot.spot_id}</p>
                        </div>
                        <span className="text-blue-400 text-2xl font-bold">{spot.percentage}%</span>
                      </div>
                      <div className="w-full bg-slate-600 rounded-full h-3 mb-3">
                        <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${spot.percentage}%` }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${spot.is_available ? 'bg-green-400' : 'bg-red-400'}`} />
                        <span className={`text-sm font-semibold ${spot.is_available ? 'text-green-400' : 'text-red-400'}`}>
                          {spot.is_available ? '현재 비어있음' : '현재 사용 중'}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="text-slate-500 text-xs text-center pt-1">
                    총 {spotPreference.total_visits}회 이용 기록 기반
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ResidentBottomNav />
    </div>
  )
}
