import { createClient } from '@lumi.new/sdk'

export const lumi = createClient({
  projectId: 'p379626134021566464',
  apiBaseUrl: 'https://api.lumi.new',
  authOrigin: 'https://auth.lumi.new',
})

export const DEMO_PLATE = '12가3456'

export function withLumiTimeout<T>(promise: Promise<T>, ms = 3000): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>
  const timer = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error('lumi timeout')), ms)
  })
  return Promise.race([promise, timer]).finally(() => clearTimeout(timerId))
}

export async function resolveUserPlate(userId: string | undefined, userName?: string): Promise<string> {
  // 1. Lumi user_vehicle 조회
  if (userId) {
    try {
      const { list } = await withLumiTimeout(
        lumi.entities.user_vehicle.list({ filter: { user_id: userId }, limit: 1 })
      )
      if (list.length > 0) {
        const v = list[0] as unknown as { car_number?: string }
        if (v.car_number) return v.car_number
      }
    } catch { /* Lumi 조회 실패/타임아웃 */ }
  }
  // 2. 백엔드 VEHICLE_COLOR_MAP에서 이름으로 번호판 조회
  if (userName) {
    try {
      const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000'
      const token = lumi.auth.accessToken
      const r = await fetch(`${base}/users/plate?name=${encodeURIComponent(userName)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (r.ok) {
        const data = await r.json() as { plate_no?: string }
        if (data.plate_no) return data.plate_no
      }
    } catch { /* 조용히 실패 */ }
  }
  return DEMO_PLATE
}

export function formatElapsedTime(entryTime: string | undefined): string {
  if (!entryTime) return '0분'
  const elapsed = Date.now() - new Date(entryTime).getTime()
  const hours = Math.floor(elapsed / (1000 * 60 * 60))
  const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60))
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
}
