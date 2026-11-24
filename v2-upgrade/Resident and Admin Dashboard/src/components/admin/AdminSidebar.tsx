import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { LayoutDashboard, Camera, AlertTriangle, Users, UserCheck, LogOut, Bell, Sliders } from 'lucide-react'
import { lumi } from "../../lib/lumi"

export default function AdminSidebar() {
  const location = useLocation()
  const [pendingVisitors, setPendingVisitors] = useState(0)

  useEffect(() => {
    fetchPendingVisitors()
    const interval = setInterval(fetchPendingVisitors, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchPendingVisitors = async () => {
    try {
      const { list } = await lumi.entities.visitor.list({
        filter: { approval_status: "pending" },
        limit: 100
      })
      setPendingVisitors(list.length)
    } catch {
      setPendingVisitors(3)
    }
  }

  const menuItems = [
    { path: "/admin",                    icon: LayoutDashboard, label: "대시보드" },
    { path: "/admin/cctv",               icon: Camera,          label: "CCTV 모니터링" },
    { path: "/admin/violations",         icon: AlertTriangle,   label: "불법 주차 관리" },
    { path: "/admin/parking-control",    icon: Sliders,         label: "주차 제어" },
    { path: "/admin/members",            icon: Users,           label: "회원 관리" },
    { path: "/admin/visitors",           icon: UserCheck,       label: "방문자 승인" },
  ]

  return (
    <div className="w-60 min-h-screen flex flex-col" style={{ background: "#080f1d", borderRight: "1px solid #1e3a5f" }}>
      {/* 브랜드 */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid #1e3a5f" }}>
        <div className="font-mono font-bold tracking-widest text-sm" style={{ color: "#00d4ff" }}>PCS</div>
        <div className="text-xs tracking-widest mt-0.5" style={{ color: "#2d5a8a" }}>PARKING CONTROL SYS</div>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 py-4 space-y-0.5 px-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative ${
                isActive ? "text-[#93c5fd]" : "text-[#4a6a8a] hover:text-[#7aa3c0]"
              }`}
              style={isActive ? {
                background: "linear-gradient(90deg, rgba(26,86,219,0.2), transparent)",
                borderLeft: "2px solid #1a56db",
              } : {
                borderLeft: "2px solid transparent",
              }}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="text-sm">{item.label}</span>
              {item.path === "/admin/violations" && pendingVisitors > 0 && (
                <div className="ml-auto flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingVisitors}</span>
                </div>
              )}
              {item.path === "/admin/visitors" && pendingVisitors > 0 && (
                <div className="ml-auto">
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{pendingVisitors}</span>
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className="px-2 py-4" style={{ borderTop: "1px solid #1e3a5f" }}>
        <button
          onClick={() => lumi.auth.signOut()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full transition-all text-[#ef4444] hover:bg-red-500/[0.08]"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">로그아웃</span>
        </button>
      </div>
    </div>
  )
}
