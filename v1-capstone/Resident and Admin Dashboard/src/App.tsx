import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import { useAuth } from "./hooks/useAuth"
import LoginPage from "./pages/LoginPage"
import AdminDashboard from "./pages/admin/AdminDashboard"
import AdminOverview from "./pages/admin/AdminOverview"
import AdminUsers from "./pages/admin/AdminUsers"
import AdminCCTV from "./pages/admin/AdminCCTV"
import AdminViolations from "./pages/admin/AdminViolations"
import AdminMembers from "./pages/admin/AdminMembers"
import AdminVisitors from "./pages/admin/AdminVisitors"
import AdminParkingControl from "./pages/admin/AdminParkingControl"
import ResidentHome from "./pages/resident/ResidentHome"
import ResidentVehicle from "./pages/resident/ResidentVehicle"
import ResidentParking from "./pages/resident/ResidentParking"
import ResidentHistory from "./pages/resident/ResidentHistory"
import ResidentVisitors from "./pages/resident/ResidentVisitors"
import ResidentSettings from "./pages/resident/ResidentSettings"

function App() {
  const { user, isAdmin, isResident } = useAuth()

  if (!user) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage />
      </>
    )
  }

  return (
    <>
      <Toaster position="top-right" />
      <Router>
        <div className="min-h-screen bg-slate-900">
          <Routes>
            {/* Admin Routes */}
            {isAdmin && (
              <>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/overview" element={<AdminOverview />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/cctv" element={<AdminCCTV />} />
                <Route path="/admin/violations" element={<AdminViolations />} />
                <Route path="/admin/parking-control" element={<AdminParkingControl />} />
                <Route path="/admin/members" element={<AdminMembers />} />
                <Route path="/admin/visitors" element={<AdminVisitors />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </>
            )}

            {/* Resident Routes */}
            {isResident && (
              <>
                <Route path="/resident" element={<ResidentHome />} />
                <Route path="/resident/vehicle" element={<ResidentVehicle />} />
                <Route path="/resident/parking" element={<ResidentParking />} />
                <Route path="/resident/history" element={<ResidentHistory />} />
                <Route path="/resident/visitors" element={<ResidentVisitors />} />
                <Route path="/resident/settings" element={<ResidentSettings />} />
                <Route path="*" element={<Navigate to="/resident" replace />} />
              </>
            )}
          </Routes>
        </div>
      </Router>
    </>
  )
}

export default App