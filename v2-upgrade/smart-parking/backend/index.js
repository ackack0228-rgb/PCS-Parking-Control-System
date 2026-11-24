require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const sec = require("./security");

const app = express();
app.disable("x-powered-by");
app.set("query parser", "simple");           // ?a[b]=c 를 객체로 만들지 않는다
app.use(cors(sec.corsOptions()));             // 허용된 출처(대시보드)만
app.use(express.json({ limit: "20kb" }));
app.use(sec.rateLimit());
app.use(sec.rejectNonPrimitiveInput);         // 쿼리·바디에 객체/배열 금지

// 데모용 인메모리 알림 저장소 (서버 재시작 시 초기화)
const notifications = [];
let notifIdSeq = 1;
const NOTIFICATION_MAX = 1000;
function pushNotification(n) {
  notifications.push(n);
  if (notifications.length > NOTIFICATION_MAX) notifications.splice(0, notifications.length - NOTIFICATION_MAX);
}

// 색깔 → 입주민 매핑 (데모용 하드코딩)
const VEHICLE_COLOR_MAP = {
  red:  { plate_no: '12가3456', name: '김근영' },
  blue: { plate_no: '34나5678', name: '정문영' },
  gray: { plate_no: '56다9012', name: '박지민' },
};

// ── 인증 · 권한 ──
// admin : 관리자(ADMIN)만 / member : 로그인한 관리자·입주민(USER)
const auth   = sec.authenticate(VEHICLE_COLOR_MAP);
const admin  = [auth, sec.requireRole("ADMIN")];
const member = [auth, sec.requireRole("ADMIN", "USER")];
const forbidden = (res) => res.status(403).json({ message: "본인 정보만 조회할 수 있습니다" });

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "app",
  password: process.env.DB_PASSWORD || "apppass",
  database: process.env.DB_NAME || "smartparking",
  waitForConnections: true,
  connectionLimit: 10,
});

// =========================
// Health
// =========================
app.get("/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT NOW() AS now");
    res.json({ ok: true, now: rows[0].now });
  } catch (err) {
    console.error("health error:", err);
    res.status(500).json({ ok: false, message: "DB error" });
  }
});

// =========================
// Cameras  (온라인/오프라인 현황)
// =========================
const CAMERA_ONLINE_SEC = Number(process.env.CAMERA_ONLINE_THRESHOLD_SEC || 45);

app.get("/cameras/stats", ...admin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT camera_id, camera_code, camera_role, location_desc, is_enabled, last_seen_at
      FROM cameras
      WHERE is_enabled = 1
      ORDER BY camera_code ASC
    `);

    const now = Date.now();
    const cameras = rows.map((c) => ({
      ...c,
      // last_seen_at 기준으로 온라인 판단 (AI 이벤트가 오면 갱신됨)
      online: c.last_seen_at
        ? (now - new Date(c.last_seen_at).getTime()) / 1000 <= CAMERA_ONLINE_SEC
        : false,
    }));

    res.json({
      total:   cameras.length,
      online:  cameras.filter((c) => c.online).length,
      offline: cameras.filter((c) => !c.online).length,
      cameras,
    });
  } catch (err) {
    console.error("cameras/stats error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Spots stats  (주차 점유 현황)
// =========================
app.get("/spots/stats", ...member, async (req, res) => {
  try {
    // 전체 주차면 수 (금지구역 제외)
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM parking_spots WHERE is_active = 1 AND spot_type_code != 'forbidden'`
    );

    // spot_id별 최신 로그 기준으로 현재 점유 수 계산 (활성 일반 주차면만)
    const [[{ occupied }]] = await pool.query(`
      SELECT COUNT(*) AS occupied
      FROM spot_status_logs s1
      JOIN (
        SELECT spot_id, MAX(captured_at) AS max_at
        FROM spot_status_logs
        GROUP BY spot_id
      ) s2 ON s1.spot_id = s2.spot_id AND s1.captured_at = s2.max_at
      JOIN parking_spots ps ON s1.spot_id = ps.spot_id
      WHERE s1.is_occupied = 1
        AND ps.is_active = 1
        AND ps.spot_type_code != 'forbidden'
    `);

    res.json({ total: Number(total), occupied: Number(occupied) });
  } catch (err) {
    console.error("spots/stats error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Violations  (신버전 스키마: violations + plates 테이블)
// =========================
app.get("/violations/open", ...admin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        v.violation_id   AS id,
        p.plate_no       AS plate_text,
        v.spot_id,
        v.violation_type_code  AS violation_type,
        v.violation_status_code AS status,
        c.camera_code,
        v.created_at
      FROM violations v
      LEFT JOIN plates  p ON p.plate_id  = v.plate_id
      LEFT JOIN cameras c ON c.camera_id = v.camera_id
      WHERE v.violation_status_code = 'open'
      ORDER BY v.created_at DESC
      LIMIT 200
    `);
    res.json(rows);
  } catch (err) {
    console.error("violations/open error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.post("/violations/:id/resolve", ...admin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [result] = await pool.query(
      `
      UPDATE violations
      SET violation_status_code = 'resolved', resolved_at = NOW()
      WHERE violation_id = ? AND violation_status_code = 'open'
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or already resolved" });
    }

    res.json({ ok: true, id });
  } catch (err) {
    console.error("violations/:id/resolve error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Forbidden occupied  (신버전: parking_spots + spot_status_logs)
// =========================
app.get("/spots/forbidden-occupied", ...admin, async (req, res) => {
  const latestLog = `
    SELECT s1.*
    FROM spot_status_logs s1
    JOIN (
      SELECT spot_id, MAX(captured_at) AS max_at
      FROM spot_status_logs
      GROUP BY spot_id
    ) s2 ON s1.spot_id = s2.spot_id AND s1.captured_at = s2.max_at
  `;
  try {
    // 1. 금지구역 점유
    const [forbidden] = await pool.query(`
      SELECT ps.spot_id, p.plate_no AS last_plate_text, slog.captured_at AS last_seen_at, 'forbidden' AS type
      FROM parking_spots ps
      JOIN (${latestLog}) slog ON slog.spot_id = ps.spot_id
      LEFT JOIN plates p ON p.plate_id = slog.plate_id
      WHERE ps.spot_type_code = 'forbidden' AND slog.is_occupied = 1
      ORDER BY slog.captured_at DESC
    `);

    // 2. 일반 칸 점유인데 vehicle_sessions 에 parked 세션이 없는 칸 (이중주차 감지)
    const [doubleParked] = await pool.query(`
      SELECT ps.spot_id, p.plate_no AS last_plate_text, slog.captured_at AS last_seen_at, 'double_parked' AS type
      FROM parking_spots ps
      JOIN (${latestLog}) slog ON slog.spot_id = ps.spot_id
      LEFT JOIN plates p ON p.plate_id = slog.plate_id
      WHERE ps.spot_type_code != 'forbidden'
        AND ps.is_active = 1
        AND slog.is_occupied = 1
        AND ps.spot_id NOT IN (
          SELECT spot_id FROM vehicle_sessions WHERE status = 'parked' AND spot_id IS NOT NULL
        )
      ORDER BY slog.captured_at DESC
    `);

    res.json([...forbidden, ...doubleParked]);
  } catch (err) {
    console.error("spots/forbidden-occupied error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Spots current status  (주차 제어용 현재 상태)
// =========================
app.get("/spots/status", ...admin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        ps.spot_id,
        ps.zone,
        ps.spot_type_code,
        COALESCE(sl.is_occupied, 0) AS is_occupied,
        p.plate_no AS current_plate
      FROM parking_spots ps
      LEFT JOIN (
        SELECT s1.spot_id, s1.is_occupied, s1.plate_id
        FROM spot_status_logs s1
        INNER JOIN (
          SELECT spot_id, MAX(captured_at) AS max_at
          FROM spot_status_logs
          GROUP BY spot_id
        ) s2 ON s1.spot_id = s2.spot_id AND s1.captured_at = s2.max_at
      ) sl ON sl.spot_id = ps.spot_id
      LEFT JOIN plates p ON p.plate_id = sl.plate_id
      WHERE ps.is_active = 1
      ORDER BY ps.spot_id
    `);
    res.json(rows);
  } catch (err) {
    console.error("spots/status error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Admin Parking Control  (색깔 기반 입차/출차)
// =========================
app.post("/admin/parking/color-enter", ...admin, async (req, res) => {
  const { color } = req.body || {};
  const vehicle = VEHICLE_COLOR_MAP[color];
  if (!vehicle) return res.status(400).json({ message: "알 수 없는 색깔입니다. red/blue/gray 중 하나" });

  try {
    // 1) 이미 pending 세션이 있으면 거부 — 동시 pending은 칸 매핑 오류의 원인
    const [[existingPending]] = await pool.query(
      `SELECT color FROM vehicle_sessions WHERE status = 'pending' LIMIT 1`
    );
    if (existingPending) {
      return res.status(409).json({
        message: `'${existingPending.color}' 차량이 아직 칸 감지 중입니다. 감지 완료 후 다음 차를 입차하세요.`
      });
    }

    // 2) vehicle_sessions에 입차 기록 (pending)
    await pool.query(
      `REPLACE INTO vehicle_sessions (color, plate_no, spot_id, entered_at, status)
       VALUES (?, ?, NULL, NOW(), 'pending')`,
      [color, vehicle.plate_no]
    );

    // 2) 현재 빈 자리 조회
    const [spots] = await pool.query(`
      SELECT ps.spot_id,
        COALESCE(
          (SELECT sl.is_occupied FROM spot_status_logs sl
           WHERE sl.spot_id = ps.spot_id
           ORDER BY sl.captured_at DESC LIMIT 1),
          0
        ) AS is_occupied
      FROM parking_spots ps
      WHERE ps.is_active = 1 AND ps.spot_type_code != 'forbidden'
      ORDER BY ps.spot_id
    `);
    const available = spots.filter(s => !s.is_occupied);

    // 3) 선호 주차칸 조회 (이력 없으면 빈 배열)
    const [preferred] = await pool.query(`
      SELECT ps.spot_id,
        COUNT(sl.status_log_id) AS visit_count,
        COALESCE(
          (SELECT sl2.is_occupied FROM spot_status_logs sl2
           WHERE sl2.spot_id = ps.spot_id
           ORDER BY sl2.captured_at DESC LIMIT 1),
          0
        ) AS is_occupied
      FROM spot_status_logs sl
      JOIN plates p ON sl.plate_id = p.plate_id
      JOIN parking_spots ps ON sl.spot_id = ps.spot_id
      WHERE p.plate_no = ? AND sl.is_occupied = 1 AND ps.is_active = 1
      GROUP BY ps.spot_id
      ORDER BY visit_count DESC
      LIMIT 3
    `, [vehicle.plate_no]);

    // 4) 알림 메시지 생성
    const availableStr = available.length > 0
      ? available.map(s => `${s.spot_id} 🟢`).join('  ')
      : '현재 빈 자리 없음';

    let prefStr = '';
    if (preferred.length > 0) {
      const top = preferred[0];
      const avail = top.is_occupied ? '🔴 사용 중' : '🟢 비어있음';
      prefStr = ` | 선호 1위: ${top.spot_id} ${avail}`;
    }

    const message = `차량이 도착했습니다! 빈자리: ${availableStr}${prefStr}`;

    // 5) 입주민에게 알림 저장
    pushNotification({
      id: notifIdSeq++,
      plate_no: vehicle.plate_no,
      spot_id: null,
      message,
      created_at: new Date().toISOString(),
      dismissed: false,
    });

    console.log(`🚗 ${color} 차(${vehicle.name}) 입차 — ${message}`);
    res.json({ ok: true, color, name: vehicle.name, message, available, preferred });
  } catch (err) {
    console.error("color-enter error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.post("/admin/parking/color-exit", ...admin, async (req, res) => {
  const { color } = req.body || {};
  const vehicle = VEHICLE_COLOR_MAP[color];
  if (!vehicle) return res.status(400).json({ message: "알 수 없는 색깔입니다. red/blue/gray 중 하나" });

  try {
    // 1) 현재 세션 조회 (parked 또는 pending)
    const [[session]] = await pool.query(
      `SELECT spot_id, status FROM vehicle_sessions WHERE color = ? AND status IN ('parked', 'pending')`,
      [color]
    );
    if (!session) {
      return res.status(400).json({ message: "현재 주차 중인 차량이 없습니다." });
    }

    // pending 상태(AI 미확정): spot_id 없이 세션만 취소
    if (session.status === 'pending') {
      await pool.query(`UPDATE vehicle_sessions SET status = 'exited' WHERE color = ?`, [color]);
      return res.json({ ok: true, spot_id: null, notified: 0 });
    }

    const spot_id = session.spot_id;

    // 2) PI-01 device 조회
    const [[device]] = await pool.query(
      `SELECT device_id FROM devices WHERE device_code = 'PI-01' LIMIT 1`
    );
    if (!device) return res.status(500).json({ message: "기기(PI-01)를 찾을 수 없습니다" });

    // 3) spot_status_logs에 is_occupied=0 삽입
    await pool.query(
      `INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
       VALUES (?, ?, 0, NULL, 0.99, NOW())`,
      [spot_id, device.device_id]
    );

    // 4) vehicle_sessions 상태 업데이트 + 이력 저장
    const [[sess]] = await pool.query(
      `SELECT entered_at FROM vehicle_sessions WHERE color = ?`,
      [color]
    );
    await pool.query(
      `UPDATE vehicle_sessions SET status = 'exited' WHERE color = ?`,
      [color]
    );
    if (sess) {
      const [[spot]] = await pool.query(
        `SELECT zone FROM parking_spots WHERE spot_id = ? LIMIT 1`,
        [spot_id]
      );
      await pool.query(
        `INSERT INTO vehicle_session_history (plate_no, spot_id, zone, entered_at, exited_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [vehicle.plate_no, spot_id, spot?.zone ?? null, sess.entered_at]
      );
    }

    // 5) 이 칸을 선호하는 입주민들에게 출차 알림 (출차한 차량 본인 제외)
    const [preferredPlates] = await pool.query(`
      SELECT DISTINCT p.plate_no
      FROM spot_status_logs slog
      JOIN plates p ON slog.plate_id = p.plate_id
      WHERE slog.spot_id = ? AND slog.is_occupied = 1 AND p.plate_no != ?
    `, [spot_id, vehicle.plate_no]);

    for (const row of preferredPlates) {
      pushNotification({
        id: notifIdSeq++,
        plate_no: row.plate_no,
        spot_id,
        message: `선호 주차칸 ${spot_id}이(가) 비었습니다!`,
        created_at: new Date().toISOString(),
        dismissed: false,
      });
    }

    console.log(`🚗 ${color} 차(${vehicle.name}) 출차 — ${spot_id} | 알림 ${preferredPlates.length}건`);
    res.json({ ok: true, spot_id, notified: preferredPlates.length });
  } catch (err) {
    console.error("color-exit error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.get("/admin/parking/vehicle-sessions", ...member, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT color, plate_no, spot_id, entered_at, status
       FROM vehicle_sessions
       ORDER BY FIELD(status, 'parked', 'pending', 'exited'), entered_at DESC`
    );
    // 입주민에게는 본인 차량 세션만
    res.json(sec.isAdmin(req) ? rows : rows.filter((r) => sec.canAccessPlate(req, r.plate_no)));
  } catch (err) {
    console.error("vehicle-sessions error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.post("/admin/parking/exit", ...admin, async (req, res) => {
  const { spot_id } = req.body || {};
  if (typeof spot_id !== "string" || !spot_id || spot_id.length > 20) {
    return res.status(400).json({ message: "spot_id is required" });
  }
  try {
    const [[spot]] = await pool.query(`SELECT spot_id FROM parking_spots WHERE spot_id = ? AND is_active = 1`, [spot_id]);
    if (!spot) return res.status(404).json({ message: "존재하지 않는 주차면입니다" });
    const [[device]] = await pool.query(
      `SELECT device_id FROM devices WHERE device_code = 'PI-01' LIMIT 1`
    );
    if (!device) return res.status(500).json({ message: "기기(PI-01)를 찾을 수 없습니다" });

    await pool.query(
      `INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
       VALUES (?, ?, 0, NULL, 0.99, NOW())`,
      [spot_id, device.device_id]
    );

    // 이 칸을 선호하는 plate_no 찾기 (현재 점유 차량 제외)
    const [[currentOccupant]] = await pool.query(`
      SELECT p.plate_no FROM spot_status_logs slog
      JOIN plates p ON slog.plate_id = p.plate_id
      WHERE slog.spot_id = ? ORDER BY slog.captured_at DESC LIMIT 1
    `, [spot_id]);
    const excludePlate = currentOccupant?.plate_no ?? null;

    const [preferredPlates] = await pool.query(`
      SELECT DISTINCT p.plate_no
      FROM spot_status_logs slog
      JOIN plates p ON slog.plate_id = p.plate_id
      WHERE slog.spot_id = ? AND slog.is_occupied = 1
        ${excludePlate ? 'AND p.plate_no != ?' : ''}
    `, excludePlate ? [spot_id, excludePlate] : [spot_id]);

    for (const row of preferredPlates) {
      pushNotification({
        id: notifIdSeq++,
        plate_no: row.plate_no,
        spot_id,
        message: `선호 주차칸 ${spot_id}이(가) 비었습니다!`,
        created_at: new Date().toISOString(),
        dismissed: false,
      });
    }

    res.json({ ok: true, spot_id, notified: preferredPlates.length });
  } catch (err) {
    console.error("admin/parking/exit error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// Notifications  (입주민 인앱 알림)
// =========================
app.get("/notifications", ...member, (req, res) => {
  const { plate_no } = req.query;
  if (!plate_no) return res.status(400).json({ message: "plate_no is required" });
  if (!sec.canAccessPlate(req, plate_no)) return forbidden(res);
  res.json(notifications.filter((n) => n.plate_no === plate_no && !n.dismissed));
});

app.post("/notifications/:id/dismiss", ...member, (req, res) => {
  const id = Number(req.params.id);
  const n = notifications.find((n) => n.id === id);
  if (n && !sec.canAccessPlate(req, n.plate_no)) return forbidden(res);
  if (n) n.dismissed = true;
  res.json({ ok: true });
});

// =========================
// Users  (회원 목록)
// =========================
app.get("/users", ...admin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        u.user_id   AS id,
        u.name,
        u.phone,
        u.email,
        u.role,
        u.building,
        u.unit_no,
        u.created_at,
        COUNT(uv.user_vehicle_id) AS vehicle_count
      FROM users u
      LEFT JOIN user_vehicles uv ON uv.user_id = u.user_id
      GROUP BY u.user_id
      ORDER BY u.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("users error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// 이름으로 번호판 조회 (입주민 앱용)
app.get("/users/plate", ...member, (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ message: "name required" });
  if (!sec.canAccessName(req, name)) return forbidden(res);
  const entry = Object.values(VEHICLE_COLOR_MAP).find((v) => v.name === name);
  if (!entry) return res.status(404).json({ message: "not found" });
  res.json({ plate_no: entry.plate_no });
});

// =========================
// Visitor Passes  (방문자 출입증)
// =========================
app.get("/visitors/pending", ...admin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        vp.pass_id       AS id,
        vp.visitor_name,
        vp.plate_no,
        vp.visit_date,
        vp.visit_time,
        vp.expiration_at,
        vp.purpose,
        vp.status,
        vp.created_at,
        u.name           AS host_name,
        u.building,
        u.unit_no
      FROM visitor_passes vp
      LEFT JOIN users u ON u.user_id = vp.host_user_id
      WHERE vp.status = 'pending'
      ORDER BY vp.visit_date ASC, vp.created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("visitors/pending error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.post("/visitors/:id/approve", ...admin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.query(
      `UPDATE visitor_passes SET status = 'approved', updated_at = NOW() WHERE pass_id = ? AND status = 'pending'`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or already processed" });
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error("visitors/:id/approve error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

app.post("/visitors/:id/reject", ...admin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.query(
      `UPDATE visitor_passes SET status = 'rejected', updated_at = NOW() WHERE pass_id = ? AND status = 'pending'`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Not found or already processed" });
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.error("visitors/:id/reject error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// 입주민: 방문자 출입증 등록
app.post("/visitors", ...member, async (req, res) => {
  const body = req.body || {};
  const name    = sec.optionalString(body.visitor_name, 50);
  const plate   = sec.optionalString(body.plate_no, 20);
  const time    = sec.optionalString(body.visit_time, 50);
  const purp    = sec.optionalString(body.purpose, 100);
  const hostIn  = sec.optionalString(body.host_name, 50);
  const visit_date = typeof body.visit_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.visit_date) ? body.visit_date : null;
  if (!name.ok || !name.value || !visit_date || !plate.ok || !time.ok || !purp.ok || !hostIn.ok) {
    return res.status(400).json({ message: "visitor_name(50자 이하), visit_date(YYYY-MM-DD) 필수 / 입력 길이를 확인하세요" });
  }
  // 입주민은 본인 이름으로만 등록 (관리자는 지정 가능)
  const host_name = sec.isAdmin(req) ? hostIn.value : req.user.userName;
  const visitor_name = name.value, plate_no = plate.value, visit_time = time.value, purpose = purp.value;
  try {
    // host_name으로 MySQL users 테이블에서 user_id 조회 (없으면 NULL)
    let host_user_id = null;
    if (host_name) {
      const [[user]] = await pool.query(
        `SELECT user_id FROM users WHERE name = ? LIMIT 1`,
        [host_name]
      );
      if (user) host_user_id = user.user_id;
    }
    const [result] = await pool.query(
      `INSERT INTO visitor_passes (visitor_name, plate_no, host_user_id, visit_date, visit_time, purpose, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [visitor_name, plate_no || null, host_user_id, visit_date, visit_time || null, purpose || null]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    console.error("POST /visitors error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// 입주민: 내가 등록한 방문자 목록
app.get("/visitors/my", ...member, async (req, res) => {
  const { host_name } = req.query;
  if (!host_name) return res.status(400).json({ message: "host_name 필수" });
  if (!sec.canAccessName(req, host_name)) return forbidden(res);
  try {
    const [rows] = await pool.query(
      `SELECT
        vp.pass_id AS id,
        vp.visitor_name,
        vp.plate_no,
        vp.visit_date,
        vp.visit_time,
        vp.purpose,
        vp.status,
        vp.created_at
       FROM visitor_passes vp
       LEFT JOIN users u ON u.user_id = vp.host_user_id
       WHERE u.name = ?
       ORDER BY vp.visit_date DESC, vp.created_at DESC
       LIMIT 50`,
      [host_name]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /visitors/my error:", err);
    res.status(500).json({ message: "internal error" });
  }
});

// =========================
// 입주민 선호 주차칸
// =========================
app.get("/parking/spot-preference", ...member, async (req, res) => {
  const { plate_no } = req.query;
  if (!plate_no) {
    return res.status(400).json({ message: "plate_no is required" });
  }
  if (!sec.canAccessPlate(req, plate_no)) return forbidden(res);

  try {
    // vehicle_session_history(색깔 입출차 기록) + spot_status_logs(AI 카메라 감지) 합산
    const [preferenceRows] = await pool.query(
      `SELECT spot_id, zone, SUM(visit_count) AS visit_count
       FROM (
         -- 색깔 기반 완료 세션 이력
         SELECT vsh.spot_id, ps.zone, COUNT(*) AS visit_count
         FROM vehicle_session_history vsh
         JOIN parking_spots ps ON vsh.spot_id = ps.spot_id
         WHERE vsh.plate_no = ?
           AND ps.is_active = 1
           AND ps.spot_type_code != 'forbidden'
         GROUP BY vsh.spot_id, ps.zone

         UNION ALL

         -- AI 카메라 감지 로그 (번호판 직접 인식된 경우)
         SELECT sl.spot_id, ps.zone, COUNT(*) AS visit_count
         FROM spot_status_logs sl
         JOIN plates p ON sl.plate_id = p.plate_id
         JOIN parking_spots ps ON sl.spot_id = ps.spot_id
         WHERE p.plate_no = ?
           AND sl.is_occupied = 1
           AND ps.is_active = 1
           AND ps.spot_type_code != 'forbidden'
         GROUP BY sl.spot_id, ps.zone
       ) combined
       GROUP BY spot_id, zone
       ORDER BY visit_count DESC
       LIMIT 5`,
      [plate_no, plate_no]
    );

    if (preferenceRows.length === 0) {
      return res.json({ preferred_spots: [], total_visits: 0 });
    }

    const totalVisits = preferenceRows.reduce((sum, r) => sum + Number(r.visit_count), 0);
    const spotIds = preferenceRows.map((r) => r.spot_id);

    // 선호 주차칸들의 현재 점유 여부 조회
    const [statusRows] = await pool.query(
      `SELECT sl1.spot_id, sl1.is_occupied
       FROM spot_status_logs sl1
       INNER JOIN (
         SELECT spot_id, MAX(captured_at) AS max_time
         FROM spot_status_logs
         WHERE spot_id IN (?)
         GROUP BY spot_id
       ) sl2 ON sl1.spot_id = sl2.spot_id AND sl1.captured_at = sl2.max_time`,
      [spotIds]
    );

    const statusMap = {};
    for (const row of statusRows) {
      statusMap[row.spot_id] = row.is_occupied === 0 || row.is_occupied === false;
    }

    const preferredSpots = preferenceRows.map((r) => ({
      spot_id: r.spot_id,
      zone: r.zone,
      visit_count: Number(r.visit_count),
      percentage: Math.round((Number(r.visit_count) / totalVisits) * 100),
      is_available: statusMap[r.spot_id] !== undefined ? statusMap[r.spot_id] : true,
    }));

    res.json({ preferred_spots: preferredSpots, total_visits: totalVisits });
  } catch (err) {
    console.error("spot-preference error:", err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// =========================
// 입주민 주차 이력
// =========================
app.get("/parking/history", ...member, async (req, res) => {
  const { plate_no } = req.query;
  if (!plate_no) return res.status(400).json({ message: "plate_no 파라미터가 필요합니다" });
  if (!sec.canAccessPlate(req, plate_no)) return forbidden(res);

  try {
    // 이력 목록 (최신순 20건)
    const [rows] = await pool.query(
      `SELECT spot_id, zone, entered_at, exited_at,
              TIMESTAMPDIFF(MINUTE, entered_at, exited_at) AS duration_minutes
       FROM vehicle_session_history
       WHERE plate_no = ?
       ORDER BY exited_at DESC
       LIMIT 20`,
      [plate_no]
    );

    // 통계 (전체 건수 기준)
    const [[agg]] = await pool.query(
      `SELECT COUNT(*) AS total_count,
              AVG(TIMESTAMPDIFF(MINUTE, entered_at, exited_at)) AS avg_minutes
       FROM vehicle_session_history
       WHERE plate_no = ?`,
      [plate_no]
    );

    const [[fav]] = await pool.query(
      `SELECT spot_id, COUNT(*) AS cnt
       FROM vehicle_session_history
       WHERE plate_no = ?
       GROUP BY spot_id
       ORDER BY cnt DESC
       LIMIT 1`,
      [plate_no]
    );

    res.json({
      stats: {
        total_count: Number(agg.total_count),
        avg_minutes: agg.avg_minutes != null ? Math.round(Number(agg.avg_minutes)) : 0,
        favorite_spot: fav?.spot_id ?? null,
      },
      history: rows.map((r) => ({
        spot_id: r.spot_id,
        zone: r.zone,
        entered_at: r.entered_at,
        exited_at: r.exited_at,
        duration_minutes: Number(r.duration_minutes),
      })),
    });
  } catch (err) {
    console.error("parking/history error:", err);
    res.status(500).json({ message: "서버 오류" });
  }
});

// =========================
// SSE  (실시간 위반 스트림)
// =========================
const sseClients = new Set();

// SSE 클라이언트 전체에게 데이터 전송
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    try { res.write(msg); } catch {}
  });
}

// 5초마다 open 위반 수 변화 감지 → 변경 시 브로드캐스트
let _cachedViolationCount = -1;
setInterval(async () => {
  try {
    if (sseClients.size === 0) return;
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM violations WHERE violation_status_code = 'open'`
    );
    if (Number(cnt) !== _cachedViolationCount) {
      _cachedViolationCount = Number(cnt);
      const [rows] = await pool.query(`
        SELECT
          v.violation_id   AS id,
          p.plate_no       AS plate_text,
          v.spot_id,
          v.violation_type_code  AS violation_type,
          v.violation_status_code AS status,
          c.camera_code,
          v.created_at
        FROM violations v
        LEFT JOIN plates  p ON p.plate_id  = v.plate_id
        LEFT JOIN cameras c ON c.camera_id = v.camera_id
        WHERE v.violation_status_code = 'open'
        ORDER BY v.created_at DESC
        LIMIT 200
      `);
      broadcast({ type: "violations_update", violations: rows, count: Number(cnt) });
    }
  } catch {}
}, 5000);

app.get("/events/stream", sec.authenticate(VEHICLE_COLOR_MAP, { allowQueryToken: true }), sec.requireRole("ADMIN"), (req, res) => {
  if (sseClients.size >= 50) return res.status(503).json({ message: "실시간 연결이 너무 많습니다" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 연결 즉시 현재 위반 데이터 전송
  pool.query(`
    SELECT
      v.violation_id   AS id,
      p.plate_no       AS plate_text,
      v.spot_id,
      v.violation_type_code  AS violation_type,
      v.violation_status_code AS status,
      c.camera_code,
      v.created_at
    FROM violations v
    LEFT JOIN plates  p ON p.plate_id  = v.plate_id
    LEFT JOIN cameras c ON c.camera_id = v.camera_id
    WHERE v.violation_status_code = 'open'
    ORDER BY v.created_at DESC
    LIMIT 200
  `).then(([rows]) => {
    _cachedViolationCount = rows.length;
    res.write(`data: ${JSON.stringify({ type: "violations_update", violations: rows, count: rows.length })}\n\n`);
  }).catch(() => {});

  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

// 로그인 사용자 정보 (AI 카메라 MJPEG 서버가 토큰 확인에 사용)
app.get("/auth/me", ...member, (req, res) => {
  res.json({ userId: req.user.userId, userName: req.user.userName, userRole: req.user.userRole });
});

// 마지막 에러 핸들러: 스택 트레이스·내부 메시지를 응답에 넣지 않는다
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ message: "잘못된 JSON 형식입니다" });
  if (err && err.type === "entity.too.large") return res.status(413).json({ message: "요청이 너무 큽니다" });
  console.error("unhandled error:", err);
  res.status(500).json({ message: "internal error" });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`🟢 API server running on http://localhost:${port}`);
});
