import { useState, useEffect } from "react"
import AdminSidebar from "../../components/admin/AdminSidebar"
import { Users, Search, UserCircle, Shield } from "lucide-react"
import { getUsers } from "../../lib/api"
import { lumi } from "../../lib/lumi"

interface Member {
  id: string
  name: string
  role: string
  phone: string
  email: string
  building?: string
  unit_no?: string
  vehicle_count?: number
}

export default function AdminMembers() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRole, setSelectedRole] = useState<string>("all")

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const data = await getUsers()
      if (Array.isArray(data)) {
        setMembers(data.map((u: Record<string, unknown>) => ({
          id: String(u.id),
          name: String(u.name ?? ""),
          role: String(u.role ?? ""),
          phone: String(u.phone ?? "-"),
          email: String(u.email ?? "-"),
          building: u.building !== undefined ? String(u.building) : undefined,
          unit_no: u.unit_no !== undefined ? String(u.unit_no) : undefined,
          vehicle_count: Number(u.vehicle_count || 0),
        })))
        setLoading(false)
        return
      }
    } catch {
      // fallback: Lumi SDK
    }

    try {
      const { list } = await lumi.entities.users.list({ limit: 200 })
      setMembers(list.map((u: Record<string, unknown>) => ({
        id: String(u._id ?? ""),
        name: String(u.name ?? ""),
        role: String(u.role ?? ""),
        phone: String(u.phone ?? "-"),
        email: String(u.email ?? "-"),
      })))
    } catch {
      setMembers([])
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.phone?.includes(searchTerm) ||
      m.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = selectedRole === "all" || m.role === selectedRole
    return matchesSearch && matchesRole
  })

  const roleCounts = {
    resident: members.filter(m => m.role === "resident").length,
    admin: members.filter(m => m.role === "admin").length,
  }

  const roleBadge = (role: string) => {
    if (role === "admin") return (
      <span className="px-2 py-0.5 rounded-full text-xs" style={{ border: "1px solid #a855f7", color: "#d8b4fe" }}>관리자</span>
    )
    return (
      <span className="px-2 py-0.5 rounded-full text-xs" style={{ border: "1px solid #1a56db", color: "#93c5fd" }}>입주민</span>
    )
  }

  const filterBtn = (value: string, label: string, count: number, icon: React.ReactNode) => (
    <button
      onClick={() => setSelectedRole(value)}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
      style={{
        background: selectedRole === value ? "#1a56db" : "#0d1220",
        color: selectedRole === value ? "#fff" : "#4a6a8a",
        border: `1px solid ${selectedRole === value ? "#1a56db" : "#1e3a5f"}`,
      }}
    >
      {icon}
      {label}
      <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        {count}
      </span>
    </button>
  )

  return (
    <div className="flex min-h-screen" style={{ background: "#0a0e1a" }}>
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        {/* TopBar */}
        <div className="flex items-center justify-between px-8 py-4" style={{ background: "#080f1d", borderBottom: "1px solid #1e3a5f" }}>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>회원 관리</h1>
            <p className="text-xs" style={{ color: "#4a6a8a" }}>입주민 및 관리자 계정 관리</p>
          </div>
          <span className="text-xs font-mono" style={{ color: "#4a6a8a" }}>총 {members.length}명</span>
        </div>

        <div className="flex-1 p-8">
          {/* 필터 + 검색 */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {filterBtn("all", "전체", members.length, <Users className="w-3.5 h-3.5" />)}
            {filterBtn("resident", "입주민", roleCounts.resident, <UserCircle className="w-3.5 h-3.5" />)}
            {filterBtn("admin", "관리자", roleCounts.admin, <Shield className="w-3.5 h-3.5" />)}

            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#4a6a8a" }} />
              <input
                type="text"
                placeholder="이름, 전화번호, 이메일 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg text-sm outline-none"
                style={{ background: "#0d1220", border: "1px solid #1e3a5f", color: "#f1f5f9" }}
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm" style={{ color: "#4a6a8a" }}>로딩 중...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-xl p-12 text-center" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <Users className="w-12 h-12 mx-auto mb-3" style={{ color: "#1e3a5f" }} />
              <p className="text-sm" style={{ color: "#4a6a8a" }}>회원이 없습니다</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ background: "#080f1d", border: "1px solid #1e3a5f" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: "#0d1220", borderBottom: "1px solid #1e3a5f" }}>
                    {["이름", "역할", "연락처", "이메일", "호수", "차량"].map(h => (
                      <th key={h} className="px-6 py-4 text-left text-xs font-semibold tracking-widest" style={{ color: "#4a6a8a" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      style={{ borderTop: "1px solid #1e3a5f" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#0d1220")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <td className="px-6 py-4 font-medium text-sm" style={{ color: "#f1f5f9" }}>{m.name}</td>
                      <td className="px-6 py-4">{roleBadge(m.role)}</td>
                      <td className="px-6 py-4 text-sm font-mono" style={{ color: "#93c5fd" }}>{m.phone}</td>
                      <td className="px-6 py-4 text-sm" style={{ color: "#4a6a8a" }}>{m.email}</td>
                      <td className="px-6 py-4 text-sm" style={{ color: "#4a6a8a" }}>
                        {m.building && m.unit_no ? `${m.building} ${m.unit_no}` : "-"}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono" style={{ color: "#4a6a8a" }}>
                        {m.vehicle_count !== undefined ? `${m.vehicle_count}대` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
