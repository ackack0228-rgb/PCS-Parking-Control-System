/**
 * backend/routes/dashboard.js  (B: 정석 schema.sql 기준)
 * ------------------------------------------------------------
 * ✅ 목표:
 * - 프론트가 없어도 브라우저/포스트맨으로 "DB가 제대로 쌓이고 있는지"
 *   바로 확인할 수 있는 API를 제공한다.
 *
 * ✅ 스키마 기준 테이블:
 * - parking_events     : 모든 이벤트(핵심)
 * - spot_status_logs   : 주차면 상태 로그(점유 스냅샷)
 * - violations         : 위반(불법주차)
 * - evidences          : 위반 증거(이미지/파일 참조)
 * - cameras            : 카메라 메타 + last_seen_at(online/offline 판단)
 * - plates             : 번호판 마스터(plate_id -> plate_no)
 */

const express = require("express");
const router = express.Router();
const pool = require("../db");

// cameras.last_seen_at 기준 online 판단(초)
const ONLINE_THRESHOLD_SEC = Number(process.env.CAMERA_ONLINE_THRESHOLD_SEC || 20);

/**
 * [1] 최근 이벤트 조회(디버그/시연용)
 * GET /api/debug/recent-events?limit=50
 *
 * - parking_events에서 최근 이벤트 N개 뽑아서 반환
 * - device_code/camera_code도 같이 보여주면 "현실감"이 생김
 */
router.get("/debug/recent-events", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const [rows] = await pool.query(
      `
      SELECT
        pe.event_id,
        pe.event_type_code,
        pe.spot_id,
        pe.created_at,
        c.camera_code,
        d.device_code
      FROM parking_events pe
      JOIN devices d ON d.device_id = pe.device_id
      LEFT JOIN cameras c ON c.camera_id = pe.camera_id
      ORDER BY pe.created_at DESC
      LIMIT ?
      `,
      [limit]
    );

    res.json({ ok: true, events: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

/**
 * [2] 카메라 상태 조회
 * GET /api/cameras
 *
 * - cameras.last_seen_at을 현재 시간과 비교해서 online/offline 계산
 * - 실제 운영에서는 heartbeat 이벤트가 들어오면서 last_seen_at이 계속 갱신되어야 함
 */
router.get("/cameras", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        camera_id,
        camera_code,
        camera_role,
        location_desc,
        is_enabled,
        last_seen_at,
        last_error
      FROM cameras
      ORDER BY camera_code ASC
      `
    );

    const now = Date.now();

    const cameras = rows.map((c) => {
      let online = false;

      // last_seen_at이 null이면 아직 한 번도 이벤트/하트비트가 없는 카메라
      if (c.last_seen_at) {
        const diffSec = (now - new Date(c.last_seen_at).getTime()) / 1000;
        online = diffSec <= ONLINE_THRESHOLD_SEC;
      }

      return { ...c, online };
    });

    res.json({ ok: true, cameras, online_threshold_sec: ONLINE_THRESHOLD_SEC });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

/**
 * [3] 주차면 상태 조회(로그 -> 상태화)
 * GET /api/spots/status?zone=A1
 *
 * ⚠️ 주의:
 * - spot_status_logs는 "로그" 테이블이라 현재 상태를 그대로 갖고 있지 않음
 * - 그래서 spot_id별로 captured_at이 가장 최신인 1건을 뽑아서
 *   "현재 상태"처럼 만들어 반환한다.
 */
router.get("/spots/status", async (req, res) => {
  try {
    const zone = req.query.zone ? String(req.query.zone) : null;

    // 1) 주차면 목록
    const [spots] = await pool.query(
      `
      SELECT spot_id, zone, floor, spot_type_code, is_active
      FROM parking_spots
      ${zone ? "WHERE zone=?" : ""}
      ORDER BY spot_id ASC
      `,
      zone ? [zone] : []
    );

    if (spots.length === 0) return res.json({ ok: true, spots: [] });

    const spotIds = spots.map((s) => s.spot_id);

    // 2) spot_id별 최신 상태 로그(1건)
    const [latestStatus] = await pool.query(
      `
      SELECT s1.*
      FROM spot_status_logs s1
      JOIN (
        SELECT spot_id, MAX(captured_at) AS max_at
        FROM spot_status_logs
        WHERE spot_id IN (${spotIds.map(() => "?").join(",")})
        GROUP BY spot_id
      ) s2 ON s1.spot_id = s2.spot_id AND s1.captured_at = s2.max_at
      `,
      spotIds
    );

    const statusMap = new Map();
    for (const r of latestStatus) statusMap.set(r.spot_id, r);

    // 3) plate_id -> plate_no 매핑(최신 상태 로그에 plate_id가 있는 경우)
    const plateIds = [];
    for (const r of latestStatus) if (r.plate_id) plateIds.push(r.plate_id);

    let plateMap = new Map();
    if (plateIds.length > 0) {
      const [pRows] = await pool.query(
        `
        SELECT plate_id, plate_no
        FROM plates
        WHERE plate_id IN (${plateIds.map(() => "?").join(",")})
        `,
        plateIds
      );
      plateMap = new Map(pRows.map((p) => [p.plate_id, p.plate_no]));
    }

    // 4) spot + status 합쳐서 반환(프론트/시연이 바로 쓸 수 있는 형태)
    const result = spots.map((sp) => {
      const st = statusMap.get(sp.spot_id);

      return {
        spot_id: sp.spot_id,
        zone: sp.zone,
        floor: sp.floor,
        spot_type_code: sp.spot_type_code,
        is_active: sp.is_active,

        // 상태(log 기반)
        is_occupied: st ? Number(st.is_occupied) : 0,
        last_seen_at: st ? st.captured_at : null,
        last_plate_text: st && st.plate_id ? (plateMap.get(st.plate_id) || null) : null,
        confidence: st ? st.confidence : null,
      };
    });

    res.json({ ok: true, spots: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

/**
 * [4] 위반 목록 + evidence 묶어서 조회
 * GET /api/violations?status=open|resolved|dismissed
 *
 * - violations 테이블에서 상태별 조회
 * - evidences는 violation_id로 묶어서 "최근 5개"만 붙여서 반환
 */
router.get("/violations", async (req, res) => {
  try {
    const status = String(req.query.status || "open");

    const [vRows] = await pool.query(
      `
      SELECT
        v.violation_id,
        v.spot_id,
        v.camera_id,
        c.camera_code,
        v.plate_id,
        p.plate_no AS plate_text,
        v.violation_type_code,
        v.violation_status_code,
        v.created_at,
        v.resolved_at
      FROM violations v
      LEFT JOIN plates p  ON p.plate_id = v.plate_id
      LEFT JOIN cameras c ON c.camera_id = v.camera_id
      WHERE v.violation_status_code = ?
      ORDER BY v.created_at DESC
      LIMIT 200
      `,
      [status]
    );

    if (vRows.length === 0) return res.json({ ok: true, violations: [] });

    const ids = vRows.map((r) => r.violation_id);

    const [eRows] = await pool.query(
      `
      SELECT evidence_id, event_id, violation_id, file_ref, created_at
      FROM evidences
      WHERE violation_id IN (${ids.map(() => "?").join(",")})
      ORDER BY created_at DESC
      `,
      ids
    );

    // violation_id -> evidences[] 매핑
    const evidenceMap = new Map();
    for (const e of eRows) {
      if (!evidenceMap.has(e.violation_id)) evidenceMap.set(e.violation_id, []);
      // 최근 5개까지만
      if (evidenceMap.get(e.violation_id).length < 5) {
        evidenceMap.get(e.violation_id).push({
          evidence_id: e.evidence_id,
          event_id: e.event_id,
          file_ref: e.file_ref,
          created_at: e.created_at,
        });
      }
    }

    const violations = vRows.map((v) => ({
      ...v,
      evidences: evidenceMap.get(v.violation_id) || [],
    }));

    res.json({ ok: true, violations });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

/**
 * [5] 위반 해결 처리
 * POST /api/violations/:id/resolve
 *
 * - violation_status_code를 resolved로 변경
 * - resolved_at을 NOW()로 찍음
 */
router.post("/violations/:id/resolve", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await pool.query(
      `
      UPDATE violations
      SET violation_status_code='resolved', resolved_at=NOW()
      WHERE violation_id=?
      `,
      [id]
    );

    res.json({ ok: true, violation_id: id, status: "resolved" });
  } catch (err) {
    res.status(500).json({ ok: false, error: "internal error" });
  }
});

module.exports = router;
