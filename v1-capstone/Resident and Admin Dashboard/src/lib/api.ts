/**
 * API Client for Backend Integration
 * --------------------------------------------------------
 * Node.js Express 백엔드 API와 통신하는 클라이언트
 */

import { lumi } from "./lumi";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const USE_DENO_PROXY = import.meta.env.VITE_USE_DENO_PROXY === "true";

/** 백엔드 인증용 헤더 (Lumi 로그인 토큰). 백엔드가 토큰으로 역할(ADMIN/USER)과 본인 여부를 확인한다 */
export function authHeaders(): Record<string, string> {
  const token = lumi.auth.accessToken;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** 헤더를 붙일 수 없는 요청(EventSource, <img>)용 토큰 쿼리 문자열 */
export function tokenQuery(): string {
  const token = lumi.auth.accessToken;
  return token ? `token=${encodeURIComponent(token)}` : "";
}

/**
 * 백엔드 API 호출
 */
async function callBackend(method: string, path: string, body?: Record<string, unknown>) {
  try {
    if (USE_DENO_PROXY) {
      // Deno Function 프록시 사용
      const response = await lumi.functions.invoke("backend-proxy", {
        method: "POST",
        body: { method, path, body },
      });
      return response;
    } else {
      // 직접 백엔드 호출
      const response = await fetch(`${BACKEND_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: response.statusText })) as { message?: string };
        throw new Error(err.message ?? `HTTP ${response.status}`);
      }
      return await response.json();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Network error";
    console.error("[API Error]", message, error);
    throw new Error(`Backend API failed: ${message}`);
  }
}

/**
 * Health Check
 */
export async function healthCheck() {
  return callBackend("GET", "/health");
}

/**
 * 카메라 온/오프라인 현황
 */
export async function getCameraStats() {
  return callBackend("GET", "/cameras/stats");
}

/**
 * 주차면 점유 현황
 */
export async function getSpotsStats() {
  return callBackend("GET", "/spots/stats");
}

/**
 * 미처리 위반 조회
 */
export async function getOpenViolations() {
  return callBackend("GET", "/violations/open");
}

/**
 * 위반 상세 조회
 */
export async function getViolationDetail(id: number) {
  return callBackend("GET", `/violations/${id}`);
}

/**
 * 위반 처리 완료
 */
export async function resolveViolation(id: number) {
  return callBackend("POST", `/violations/${id}/resolve`);
}

/**
 * 불법 주차 현황 (금지구역 + 이중주차)
 */
export interface IllegalParkingEntry {
  spot_id: string;
  last_plate_text: string | null;
  last_seen_at: string;
  type: 'forbidden' | 'double_parked';
}

export async function getForbiddenOccupied(): Promise<IllegalParkingEntry[]> {
  return callBackend("GET", "/spots/forbidden-occupied") as Promise<IllegalParkingEntry[]>;
}

/**
 * SSE: 실시간 위반 이벤트 구독
 * - type: 'violations_update' → violations 배열 + count
 * - 연결 종료 시 EventSource를 직접 .close() 하면 됨
 */
export interface ViolationEvent {
  type: string;
  violations: Record<string, unknown>[];
  count: number;
}

export function subscribeViolationEvents(
  onUpdate: (data: ViolationEvent) => void
): EventSource {
  const es = new EventSource(`${BACKEND_URL}/events/stream?${tokenQuery()}`);
  es.onmessage = (e) => {
    try { onUpdate(JSON.parse(e.data) as ViolationEvent); } catch { /* 파싱 실패 무시 */ }
  };
  return es;
}

/**
 * 회원 목록 조회
 */
export async function getUsers() {
  return callBackend("GET", "/users");
}

/**
 * 대기 중인 방문자 출입증 목록
 */
export async function getPendingVisitors() {
  return callBackend("GET", "/visitors/pending");
}

/**
 * 방문자 출입증 승인
 */
export async function approveVisitor(id: number) {
  return callBackend("POST", `/visitors/${id}/approve`);
}

/**
 * 방문자 출입증 거절
 */
export async function rejectVisitor(id: number) {
  return callBackend("POST", `/visitors/${id}/reject`);
}

/**
 * AI 어시스턴트 채팅
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function chatWithAssistant(messages: ChatMessage[]): Promise<string> {
  const result = await callBackend("POST", "/chat", { messages });
  if (result?.reply) return result.reply;
  throw new Error("응답을 받지 못했습니다.");
}

/**
 * 입주민 선호 주차칸 조회
 */
export interface PreferredSpot {
  spot_id: string;
  zone: string;
  visit_count: number;
  percentage: number;
  is_available: boolean;
}

export interface SpotPreferenceResult {
  preferred_spots: PreferredSpot[];
  total_visits: number;
}

export async function getSpotPreference(plateNo: string): Promise<SpotPreferenceResult> {
  return callBackend("GET", `/parking/spot-preference?plate_no=${encodeURIComponent(plateNo)}`);
}

/**
 * 주차칸 현재 상태 (관리자 제어용)
 */
export interface SpotStatus {
  spot_id: string;
  zone: string;
  spot_type_code: string;
  is_occupied: number;
  current_plate: string | null;
}

export async function getSpotsCurrentStatus(): Promise<SpotStatus[]> {
  return callBackend("GET", "/spots/status");
}

export async function adminParkingExit(spot_id: string): Promise<{ ok: boolean; notified: number }> {
  return callBackend("POST", "/admin/parking/exit", { spot_id });
}

/**
 * 색깔 기반 차량 입출차 (수동 제어)
 */
export type VehicleColor = 'red' | 'blue' | 'gray';

export interface VehicleSession {
  color: VehicleColor;
  plate_no: string;
  spot_id: string | null;
  entered_at: string;
  status: 'pending' | 'parked' | 'exited';
}

export interface ColorEnterResult {
  ok: boolean;
  color: string;
  name: string;
}

export async function colorEnter(color: VehicleColor): Promise<ColorEnterResult> {
  return callBackend('POST', '/admin/parking/color-enter', { color });
}

export async function colorExit(color: VehicleColor): Promise<{ ok: boolean; notified: number }> {
  return callBackend('POST', '/admin/parking/color-exit', { color });
}

export async function getVehicleSessions(): Promise<VehicleSession[]> {
  return callBackend('GET', '/admin/parking/vehicle-sessions');
}

/**
 * 입주민 인앱 알림
 */
export interface ParkingNotification {
  id: number;
  plate_no: string;
  spot_id: string;
  message: string;
  created_at: string;
}

export async function getNotifications(plate_no: string): Promise<ParkingNotification[]> {
  return callBackend("GET", `/notifications?plate_no=${encodeURIComponent(plate_no)}`);
}

export async function dismissNotification(id: number) {
  return callBackend("POST", `/notifications/${id}/dismiss`);
}

/**
 * 입주민 주차 이력
 */
export interface ParkingHistoryEntry {
  spot_id: string;
  zone: string | null;
  entered_at: string;
  exited_at: string;
  duration_minutes: number;
}

export interface ParkingHistoryResult {
  stats: {
    total_count: number;
    avg_minutes: number;
    favorite_spot: string | null;
  };
  history: ParkingHistoryEntry[];
}

export async function getParkingHistory(plateNo: string): Promise<ParkingHistoryResult> {
  return callBackend("GET", `/parking/history?plate_no=${encodeURIComponent(plateNo)}`);
}

/**
 * 방문자 출입증 (입주민)
 */
export interface VisitorPass {
  id: number;
  visitor_name: string;
  plate_no: string | null;
  visit_date: string;
  visit_time: string | null;
  purpose: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface CreateVisitorBody {
  visitor_name: string;
  plate_no?: string;
  visit_date: string;
  visit_time?: string;
  purpose?: string;
  host_name: string;
}

export async function getMyVisitors(hostName: string): Promise<VisitorPass[]> {
  return callBackend("GET", `/visitors/my?host_name=${encodeURIComponent(hostName)}`);
}

export async function createVisitor(body: CreateVisitorBody): Promise<{ ok: boolean; id: number }> {
  return callBackend("POST", "/visitors", body as unknown as Record<string, unknown>);
}
