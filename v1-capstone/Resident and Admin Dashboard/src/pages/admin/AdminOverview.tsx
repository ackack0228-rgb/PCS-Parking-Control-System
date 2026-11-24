import AdminSidebar from "../../components/admin/AdminSidebar"
import {BarChart3, TrendingUp, Users, Car, Activity, Clock, CheckCircle, AlertCircle} from 'lucide-react'

export default function AdminOverview() {
  return (
    <div className="flex">
      <AdminSidebar />
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">시스템 개요</h1>
          <p className="text-slate-400">주차 관리 시스템 전체 현황 및 통계</p>
        </div>

        {/* 주요 지표 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-600/20 rounded-lg">
                <Users className="w-6 h-6 text-blue-400" />
              </div>
              <span className="text-2xl font-bold text-white">1,247</span>
            </div>
            <p className="text-slate-400 text-sm">총 등록 사용자</p>
            <div className="mt-2 flex items-center gap-1 text-green-400 text-xs">
              <TrendingUp className="w-3 h-3" />
              <span>+12% 이번 달</span>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-600/20 rounded-lg">
                <Car className="w-6 h-6 text-purple-400" />
              </div>
              <span className="text-2xl font-bold text-white">1,892</span>
            </div>
            <p className="text-slate-400 text-sm">등록 차량</p>
            <div className="mt-2 flex items-center gap-1 text-green-400 text-xs">
              <TrendingUp className="w-3 h-3" />
              <span>+8% 이번 달</span>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-600/20 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <span className="text-2xl font-bold text-white">98.7%</span>
            </div>
            <p className="text-slate-400 text-sm">시스템 가동률</p>
            <div className="mt-2 flex items-center gap-1 text-green-400 text-xs">
              <Activity className="w-3 h-3" />
              <span>정상 작동 중</span>
            </div>
          </div>

          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-orange-600/20 rounded-lg">
                <Clock className="w-6 h-6 text-orange-400" />
              </div>
              <span className="text-2xl font-bold text-white">2.3h</span>
            </div>
            <p className="text-slate-400 text-sm">평균 주차 시간</p>
            <div className="mt-2 flex items-center gap-1 text-slate-400 text-xs">
              <Activity className="w-3 h-3" />
              <span>지난주 대비 동일</span>
            </div>
          </div>
        </div>

        {/* 상세 통계 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* 주차 이용 현황 */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-6">
              <BarChart3 className="w-5 h-5 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">주차 이용 현황</h2>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300">일일 평균 이용</span>
                  <span className="text-white font-semibold">85대</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: "70%" }}></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300">피크 타임 이용률</span>
                  <span className="text-white font-semibold">118대</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-orange-500 h-2 rounded-full" style={{ width: "98%" }}></div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-300">야간 이용률</span>
                  <span className="text-white font-semibold">56대</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: "46%" }}></div>
                </div>
              </div>
            </div>
          </div>

          {/* 시스템 상태 */}
          <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-5 h-5 text-green-400" />
              <h2 className="text-xl font-semibold text-white">시스템 상태</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-slate-300">CCTV 카메라</span>
                </div>
                <span className="text-green-400 font-semibold">12/12 정상</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-slate-300">주차 센서</span>
                </div>
                <span className="text-green-400 font-semibold">120/120 정상</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-slate-300">AI 분석 엔진</span>
                </div>
                <span className="text-yellow-400 font-semibold">점검 중</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-slate-300">알림 서비스</span>
                </div>
                <span className="text-green-400 font-semibold">정상</span>
              </div>
            </div>
          </div>
        </div>

        {/* 최근 활동 로그 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <Clock className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-semibold text-white">최근 활동 로그</h2>
          </div>
          <div className="space-y-3">
            {[
              { time: "10분 전", type: "success", message: "A동 지하 2구역 - 85% 점유율 도달" },
              { time: "25분 전", type: "info", message: "방문자 3명 승인 처리 완료" },
              { time: "1시간 전", type: "warning", message: "B동 지상 CCTV-8 일시적 연결 끊김 (복구 완료)" },
              { time: "2시간 전", type: "success", message: "불법 주차 위반 2건 처리 완료" },
              { time: "3시간 전", type: "info", message: "신규 차량 12대 등록" },
            ].map((log, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition-all">
                <div className="flex-shrink-0 mt-1">
                  {log.type === "success" && <CheckCircle className="w-5 h-5 text-green-400" />}
                  {log.type === "info" && <Activity className="w-5 h-5 text-blue-400" />}
                  {log.type === "warning" && <AlertCircle className="w-5 h-5 text-yellow-400" />}
                </div>
                <div className="flex-1">
                  <p className="text-slate-300">{log.message}</p>
                  <p className="text-slate-500 text-sm mt-1">{log.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
