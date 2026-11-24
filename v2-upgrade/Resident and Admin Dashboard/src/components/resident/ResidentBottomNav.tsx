import { Link, useLocation } from "react-router-dom"
import {Home, Car, History, Users, Settings} from 'lucide-react'

export default function ResidentBottomNav() {
  const location = useLocation()

  const menuItems = [
    { path: "/resident", icon: Home, label: "홈" },
    { path: "/resident/vehicle", icon: Car, label: "내 차량" },
    { path: "/resident/history", icon: History, label: "주차 이력" },
    { path: "/resident/visitors", icon: Users, label: "방문자" },
    { path: "/resident/settings", icon: Settings, label: "설정" },
  ]

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-800 border-t border-slate-700 safe-area-bottom">
      <div className="flex justify-around items-center h-16 max-w-screen-md mx-auto px-2">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all ${
                isActive
                  ? "text-blue-400"
                  : "text-slate-400"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}