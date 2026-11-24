import { useState, useEffect } from "react"
import { lumi } from "../lib/lumi"

export function useAuth() {
  const [user, setUser] = useState(lumi.auth.user)
  const [isAuthenticated, setIsAuthenticated] = useState(lumi.auth.isAuthenticated)

  useEffect(() => {
    const unsubscribe = lumi.auth.onAuthChange(({ isAuthenticated, user }) => {
      setUser(user)
      setIsAuthenticated(isAuthenticated)
    })
    return unsubscribe
  }, [])

  return {
    user,
    isAuthenticated,
    isAdmin: user?.userRole === "ADMIN",
    isResident: user?.userRole === "USER",
    signIn: () => lumi.auth.signIn(),
    signOut: () => lumi.auth.signOut(),
  }
}