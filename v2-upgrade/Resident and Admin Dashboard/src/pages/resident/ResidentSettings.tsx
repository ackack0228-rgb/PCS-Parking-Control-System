// =========================
// 하단 네비게이션 컴포넌트
// =========================
import ResidentBottomNav from "../../components/resident/ResidentBottomNav"

// 아이콘 (lucide-react)
import { User, Bell, Shield, HelpCircle, LogOut } from 'lucide-react'

// 로그인 사용자 정보 가져오는 커스텀 훅
import { useAuth } from "../../hooks/useAuth"

// 인증 관련 기능 (로그아웃 등)
import { lumi } from "../../lib/lumi"

export default function ResidentSettings() {

  // 현재 로그인된 사용자 정보
  const { user } = useAuth()

  // =========================
  // 로그아웃 함수
  // =========================
  const handleLogout = () => {
    // lumi 인증 시스템에서 로그아웃 처리
    lumi.auth.signOut()

    // 보통 여기서
    // → 로그인 페이지로 이동하거나
    // → 상태 초기화가 자동으로 발생
  }

  // =========================
  // UI 렌더링
  // =========================
  return (
    <div className="pb-20 min-h-screen bg-slate-900">

      {/* ================= Header ================= */}
      <div className="bg-slate-800 p-6 border-b border-slate-700">
        <div className="max-w-screen-md mx-auto">
          <h1 className="text-2xl font-bold text-white">설정</h1>
          <p className="text-slate-400">계정 및 알림 설정</p>
        </div>
      </div>

      {/* ================= Content ================= */}
      <div className="max-w-screen-md mx-auto p-4 space-y-4">

        {/* ================= 프로필 카드 ================= */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">

          {/* 사용자 정보 영역 */}
          <div className="flex items-center gap-4 mb-4">

            {/* 프로필 아이콘 */}
            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>

            {/* 사용자 이름 / 이메일 */}
            <div>
              <h3 className="text-lg font-semibold text-white">
                {user?.userName}
              </h3>
              <p className="text-slate-400 text-sm">
                {user?.email}
              </p>
            </div>
          </div>

          {/* 프로필 수정 버튼 */}
          <button className="w-full py-2 text-blue-400 hover:text-blue-300 text-sm transition-all">
            프로필 수정
          </button>
        </div>

        {/* ================= 설정 메뉴 ================= */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">

          {/* 알림 설정 */}
          <button className="w-full flex items-center gap-4 p-5 hover:bg-slate-700 transition-all border-b border-slate-700">
            <Bell className="w-5 h-5 text-slate-400" />
            <div className="flex-1 text-left">
              <div className="text-white font-medium">알림 설정</div>
              <div className="text-slate-400 text-sm">푸시 및 이메일 알림</div>
            </div>
          </button>

          {/* 개인정보 보호 */}
          <button className="w-full flex items-center gap-4 p-5 hover:bg-slate-700 transition-all border-b border-slate-700">
            <Shield className="w-5 h-5 text-slate-400" />
            <div className="flex-1 text-left">
              <div className="text-white font-medium">개인정보 보호</div>
              <div className="text-slate-400 text-sm">보안 및 개인정보</div>
            </div>
          </button>

          {/* 도움말 */}
          <button className="w-full flex items-center gap-4 p-5 hover:bg-slate-700 transition-all">
            <HelpCircle className="w-5 h-5 text-slate-400" />
            <div className="flex-1 text-left">
              <div className="text-white font-medium">도움말 및 지원</div>
              <div className="text-slate-400 text-sm">FAQ 및 문의하기</div>
            </div>
          </button>
        </div>

        {/* ================= 로그아웃 ================= */}
        <button
          onClick={handleLogout} // 클릭 시 로그아웃 실행
          className="w-full flex items-center justify-center gap-3 p-4 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-xl transition-all border border-red-900/50"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">로그아웃</span>
        </button>

        {/* ================= 버전 정보 ================= */}
        <div className="text-center text-slate-500 text-sm pt-4">
          버전 1.0.0
        </div>
      </div>

      {/* 하단 네비게이션 */}
      <ResidentBottomNav />
    </div>
  )
}