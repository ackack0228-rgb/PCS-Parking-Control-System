/**
 * backend/security.js
 * ------------------------------------------------------------
 * API 보안 미들웨어 모음
 *
 * 1) 인증: 프론트가 보낸 Lumi 로그인 토큰(Authorization: Bearer ...)을
 *    Lumi 서버(/lm/user/info)에 확인해 사용자·역할(ADMIN / USER)을 알아낸다. 결과는 60초 캐시.
 * 2) 권한: requireRole('ADMIN') / requireRole('ADMIN', 'USER')
 * 3) 본인 데이터 제한: 입주민(USER)은 자기 번호판·자기 이름의 데이터만 조회 가능
 * 4) 입력 검증: 쿼리/바디에 객체·배열이 들어오면 거부 (mysql2 객체 확장 → 조건 우회 방지)
 * 5) CORS 허용 목록, 간단한 요청 횟수 제한
 */

const { createClient } = require("@lumi.new/sdk");

const LUMI_CONFIG = {
  projectId:   process.env.LUMI_PROJECT_ID   || "p379626134021566464",
  apiBaseUrl:  process.env.LUMI_API_BASE_URL || "https://api.lumi.new",
  authOrigin:  process.env.LUMI_AUTH_ORIGIN  || "https://auth.lumi.new",
};

// 프론트(lib/lumi.ts)의 DEMO_PLATE와 같은 값. 차량 정보가 없는 입주민의 fallback 번호판
const DEMO_PLATE = "12가3456";

// ── 1) 토큰 검증 ────────────────────────────────────────
const TOKEN_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map(); // token → { user, plates, exp }

function newLumiClient(token) {
  const lumi = createClient({ ...LUMI_CONFIG });
  lumi.auth.accessToken = token; // 서버 환경에서는 config.authorization 으로 들어간다
  return lumi;
}

/** Lumi에서 로그인한 사용자의 차량 번호판 조회 (user_vehicle 엔티티) */
async function fetchLumiPlates(lumi, userId) {
  try {
    const { list } = await lumi.entities.user_vehicle.list({ filter: { user_id: userId }, limit: 10 });
    return (list || []).map((v) => v && v.car_number).filter((p) => typeof p === "string" && p);
  } catch {
    return [];
  }
}

/**
 * 토큰 → { user, plates } (실패 시 null)
 * - 빈 토큰이면 SDK가 에러 없이 undefined를 돌려주므로 반드시 따로 거른다.
 */
async function verifyToken(token, vehicleColorMap) {
  if (typeof token !== "string" || token.length < 10 || token.length > 4096) return null;

  const now = Date.now();
  const hit = tokenCache.get(token);
  if (hit && hit.exp > now) return hit;

  let user;
  try {
    user = await newLumiClient(token).auth.refreshUser();
  } catch {
    return null;
  }
  if (!user || typeof user.userId !== "string" || !["ADMIN", "USER"].includes(user.userRole)) return null;

  // 입주민이 조회할 수 있는 번호판 = 프론트 resolveUserPlate 와 같은 순서
  //   Lumi user_vehicle → 이름으로 VEHICLE_COLOR_MAP → 둘 다 없으면 DEMO_PLATE
  let plates = await fetchLumiPlates(newLumiClient(token), user.userId);
  const mapped = Object.values(vehicleColorMap).find((v) => v.name === user.userName);
  if (mapped) plates.push(mapped.plate_no);
  if (plates.length === 0) plates = [DEMO_PLATE];

  const entry = {
    user: { userId: user.userId, userName: user.userName, userRole: user.userRole },
    plates: [...new Set(plates)],
    exp: now + TOKEN_TTL_MS,
  };
  if (tokenCache.size >= TOKEN_CACHE_MAX) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(token, entry);
  return entry;
}

/**
 * 인증 미들웨어
 * - Authorization: Bearer <token>
 * - EventSource(SSE)와 <img>(MJPEG 확인)는 헤더를 못 붙이므로 allowQueryToken 경로에서만 ?token= 허용
 */
function authenticate(vehicleColorMap, { allowQueryToken = false } = {}) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    let token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token && allowQueryToken && typeof req.query.token === "string") token = req.query.token;

    const entry = await verifyToken(token, vehicleColorMap);
    if (!entry) return res.status(401).json({ message: "로그인이 필요합니다" });
    req.user = entry.user;
    req.allowedPlates = entry.plates;
    next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.userRole)) {
      return res.status(403).json({ message: "권한이 없습니다" });
    }
    next();
  };
}

const isAdmin = (req) => req.user && req.user.userRole === "ADMIN";

/** 입주민은 자기 번호판만. 관리자는 전체 */
function canAccessPlate(req, plateNo) {
  return isAdmin(req) || (Array.isArray(req.allowedPlates) && req.allowedPlates.includes(plateNo));
}

/** 입주민은 자기 이름만. 관리자는 전체 */
function canAccessName(req, name) {
  return isAdmin(req) || (req.user && req.user.userName === name);
}

// ── 4) 입력 형태 검증 ───────────────────────────────────
/**
 * 쿼리 값은 문자열만, 바디 최상위 값은 원시값(문자열·숫자·불리언·null)만 허용한다.
 * mysql2는 ? 자리에 객체가 들어오면 `key` = 'value' 로 펼치기 때문에
 * ?plate_no[plate_no]=1 같은 요청이 WHERE 조건을 항상 참으로 만들 수 있다.
 */
function rejectNonPrimitiveInput(req, res, next) {
  for (const v of Object.values(req.query || {})) {
    if (typeof v !== "string") return res.status(400).json({ message: "잘못된 요청 형식입니다" });
  }
  const body = req.body;
  if (body !== undefined && body !== null && (typeof body !== "object" || Array.isArray(body))) {
    return res.status(400).json({ message: "잘못된 요청 형식입니다" });
  }
  for (const v of Object.values(body || {})) {
    if (v !== null && typeof v === "object") return res.status(400).json({ message: "잘못된 요청 형식입니다" });
  }
  next();
}

/** 문자열 필드 검증: 없으면 null, 있으면 문자열 + 최대 길이 */
function optionalString(value, max) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || value.length > max) return { ok: false };
  return { ok: true, value: value.trim() };
}

// ── 5) CORS 허용 목록 ───────────────────────────────────
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.137.1:5173", // 노트북 핫스팟으로 iPad 접속
];

function corsOptions() {
  const allowed = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(","))
    .split(",").map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, cb) {
      // origin 없음 = curl·서버 간 호출 (브라우저가 아님) → CORS 대상 아님
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST"],
    maxAge: 600,
  };
}

// ── 요청 횟수 제한 (IP별 고정 창) ─────────────────────────
// 대시보드는 3~10초 폴링이라 정상 사용은 분당 100회 안쪽
function rateLimit({ windowMs = 60_000, max = 600 } = {}) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요" });
    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
  canAccessPlate,
  canAccessName,
  isAdmin,
  rejectNonPrimitiveInput,
  optionalString,
  corsOptions,
  rateLimit,
};
