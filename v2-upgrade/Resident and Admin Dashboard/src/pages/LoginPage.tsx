import { motion } from "framer-motion"
import {Car, Shield, Camera, Users} from 'lucide-react'
import { lumi } from "../lib/lumi"

export default function LoginPage() {
  const handleLogin = async () => {
    try {
      await lumi.auth.signIn()
    } catch (error) {
      console.error("로그인 실패:", error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-block p-4 bg-blue-600 rounded-full mb-4"
          >
            <Car className="w-12 h-12 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold text-white mb-2">주차 관리 시스템</h1>
          <p className="text-blue-200">스마트 주차 관리 솔루션</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700"
        >
          <div className="space-y-6 mb-8">
            <div className="flex items-center gap-3 text-slate-300">
              <Shield className="w-5 h-5 text-green-400" />
              <span>실시간 주차 현황 모니터링</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <Camera className="w-5 h-5 text-blue-400" />
              <span>AI 기반 불법 주차 탐지</span>
            </div>
            <div className="flex items-center gap-3 text-slate-300">
              <Users className="w-5 h-5 text-purple-400" />
              <span>방문자 및 차량 관리</span>
            </div>
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 transform hover:scale-105 shadow-lg"
          >
            로그인
          </button>

          <p className="text-center text-slate-400 text-sm mt-6">
            관리자 또는 입주민 계정으로 로그인하세요
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}