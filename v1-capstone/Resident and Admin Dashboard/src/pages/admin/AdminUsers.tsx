import { useState, useEffect } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import {Search, UserPlus, MoreVertical, Shield, User, Calendar, Phone, Mail} from 'lucide-react'
import { lumi } from "../../lib/lumi"

interface AppUser {
  _id: string
  user_id: string
  name: string
  email: string
  phone: string
  role: string
  createdAt: string
  notification_pref: { push: boolean; email: boolean; sms: boolean }
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")

  useEffect(() => {
    fetchUsers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter])

  const fetchUsers = async () => {
    try {
      const filter: Record<string, unknown> = {}
      if (roleFilter !== "all") {
        filter.role = roleFilter
      }
      const result = await lumi.entities.users.list({ filter, limit: 100 })
      setUsers(result.list as unknown as AppUser[])
    } catch (error) {
      console.error("사용자 로드 실패:", error)
    }
  }

  const filteredUsers = users.filter((user) =>
    user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phone?.includes(searchQuery)
  )

  // 예시 데이터 (실제 데이터가 없을 경우)
  const exampleUsers = [
    {
      _id: "1",
      user_id: "U001",
      name: "김근영",
      email: "kim@example.com",
      phone: "010-1234-5678",
      role: "resident",
      createdAt: "2024-01-15T09:30:00Z",
      notification_pref: { push: true, email: true, sms: false },
    },
    {
      _id: "2",
      user_id: "U002",
      name: "정문영",
      email: "lee@example.com",
      phone: "010-2345-6789",
      role: "resident",
      createdAt: "2024-01-20T14:20:00Z",
      notification_pref: { push: true, email: false, sms: true },
    },
    {
      _id: "3",
      user_id: "A001",
      name: "박관리",
      email: "admin@example.com",
      phone: "010-9999-8888",
      role: "admin",
      createdAt: "2023-12-01T08:00:00Z",
      notification_pref: { push: true, email: true, sms: true },
    },
    {
      _id: "4",
      user_id: "U003",
      name: "박지민",
      email: "choi@example.com",
      phone: "010-3456-7890",
      role: "resident",
      createdAt: "2024-02-05T10:15:00Z",
      notification_pref: { push: false, email: true, sms: false },
    },
    {
      _id: "5",
      user_id: "U004",
      name: "정수진",
      email: "jung@example.com",
      phone: "010-4567-8901",
      role: "resident",
      createdAt: "2024-02-10T16:45:00Z",
      notification_pref: { push: true, email: true, sms: true },
    },
  ]

  const displayUsers = filteredUsers.length > 0 ? filteredUsers : exampleUsers

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <span className="px-3 py-1 bg-purple-600/20 text-purple-400 rounded-full text-xs font-semibold flex items-center gap-1">
          <Shield className="w-3 h-3" />
          관리자
        </span>
      case "resident":
        return <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-xs font-semibold flex items-center gap-1">
          <User className="w-3 h-3" />
          입주민
        </span>
      case "visitor":
        return <span className="px-3 py-1 bg-green-600/20 text-green-400 rounded-full text-xs font-semibold flex items-center gap-1">
          <User className="w-3 h-3" />
          방문자
        </span>
      default:
        return <span className="px-3 py-1 bg-slate-600/20 text-slate-400 rounded-full text-xs">미정</span>
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <div className="flex">
      <AdminSidebar />
      <div className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">사용자 관리</h1>
          <p className="text-slate-400">시스템에 등록된 모든 사용자를 관리합니다</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-gradient-to-br from-blue-600 to-blue-500 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">1,247</div>
            <div className="text-blue-100 text-sm">총 사용자</div>
          </div>

          <div className="bg-gradient-to-br from-purple-600 to-purple-500 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">8</div>
            <div className="text-purple-100 text-sm">관리자</div>
          </div>

          <div className="bg-gradient-to-br from-green-600 to-green-500 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">1,239</div>
            <div className="text-green-100 text-sm">입주민</div>
          </div>

          <div className="bg-gradient-to-br from-orange-600 to-orange-500 rounded-xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <div className="text-3xl font-bold text-white mb-1">+23</div>
            <div className="text-orange-100 text-sm">이번 달 신규</div>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                placeholder="이름, 이메일, 전화번호로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">모든 역할</option>
                <option value="admin">관리자</option>
                <option value="resident">입주민</option>
                <option value="visitor">방문자</option>
              </select>

              <button className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all">
                <UserPlus className="w-5 h-5" />
                <span>신규 등록</span>
              </button>
            </div>
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    사용자 정보
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    연락처
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    역할
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    가입일
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    알림 설정
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {displayUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-slate-700/30 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                          {user.name?.[0] || "U"}
                        </div>
                        <div>
                          <div className="text-white font-medium">{user.name || "이름 없음"}</div>
                          <div className="text-slate-400 text-sm">{user.user_id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-slate-300 text-sm">
                          <Mail className="w-4 h-4 text-slate-500" />
                          {user.email || "-"}
                        </div>
                        <div className="flex items-center gap-2 text-slate-300 text-sm">
                          <Phone className="w-4 h-4 text-slate-500" />
                          {user.phone || "-"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-300 text-sm">
                        <Calendar className="w-4 h-4 text-slate-500" />
                        {user.createdAt ? formatDate(user.createdAt) : "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {user.notification_pref?.push && (
                          <span className="px-2 py-1 bg-blue-600/20 text-blue-400 rounded text-xs">푸시</span>
                        )}
                        {user.notification_pref?.email && (
                          <span className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-xs">이메일</span>
                        )}
                        {user.notification_pref?.sms && (
                          <span className="px-2 py-1 bg-purple-600/20 text-purple-400 rounded text-xs">SMS</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-slate-700 rounded-lg transition-all">
                        <MoreVertical className="w-5 h-5 text-slate-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {displayUsers.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
