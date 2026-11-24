/**
 * backend/consumer.js  (B: 정석 스키마 버전)
 * ------------------------------------------------------------
 * RabbitMQ 이벤트를 받아서 "정석 schema.sql" 테이블로 저장한다.
 *
 * 저장 대상:
 * 1) devices / cameras: 코드 기준으로 없으면 자동 생성(UPSERT)
 * 2) plates: plate_text 기준으로 없으면 생성
 * 3) parking_events: 모든 이벤트 기록 (핵심)
 * 4) lpr_reads: 번호판 인식 이벤트일 때 기록
 * 5) spot_status_logs: spot_id가 있으면 "점유 스냅샷" 기록
 * 6) cameras.last_seen_at + camera_heartbeats: 카메라 상태 갱신
 * 7) violations + evidences: 금지면(spot_type_code='forbidden')이면 open 위반 생성/증거 추가
 */

require("dotenv").config();
const amqp = require("amqplib");
const mysql = require("mysql2/promise");

const RABBIT_URL = process.env.RABBIT_URL || "amqp://app:apppass@localhost:5672";
const QUEUE_NAME = process.env.RABBIT_QUEUE || "ai.events";


const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "app",
  password: process.env.DB_PASSWORD || "apppass",
  database: process.env.DB_NAME || "smartparking",
  waitForConnections: true,
  connectionLimit: 10,
});

function toMySQLDateTime(dt) {
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  return (
    `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ` +
    `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}.` +
    `${pad(dt.getMilliseconds(), 3)}`
  );
}

/**
 * devices, cameras를 "코드 기반"으로 확보
 * - devices: device_code UNIQUE
 * - cameras: camera_code UNIQUE
 * 반환: { deviceId, cameraId }
 */
async function ensureDeviceAndCamera(conn, { device_code, camera_code, camera_role }) {
  // 1) device upsert
  await conn.query(
    `
    INSERT INTO devices (device_code, device_type, is_active, last_seen_at)
    VALUES (?, 'pi', 1, NOW())
    ON DUPLICATE KEY UPDATE
      is_active = 1,
      last_seen_at = NOW()
    `,
    [device_code]
  );

  const [[deviceRow]] = await conn.query(
    `SELECT device_id FROM devices WHERE device_code = ? LIMIT 1`,
    [device_code]
  );
  const deviceId = deviceRow.device_id;

  // 2) camera upsert (role 없으면 'parking_view' 기본)
  const role = camera_role || "parking_view";
  await conn.query(
    `
    INSERT INTO cameras (camera_code, device_id, camera_role, is_enabled, last_seen_at)
    VALUES (?, ?, ?, 1, NOW())
    ON DUPLICATE KEY UPDATE
      device_id = VALUES(device_id),
      camera_role = VALUES(camera_role),
      is_enabled = 1,
      last_seen_at = NOW()
    `,
    [camera_code, deviceId, role]
  );

  const [[cameraRow]] = await conn.query(
    `SELECT camera_id FROM cameras WHERE camera_code = ? LIMIT 1`,
    [camera_code]
  );
  const cameraId = cameraRow.camera_id;

  return { deviceId, cameraId };
}

async function ensurePlate(conn, plate_text) {
  if (!plate_text) return { plateId: null };

  // plates.plate_no UNIQUE
  await conn.query(
    `
    INSERT INTO plates (plate_no)
    VALUES (?)
    ON DUPLICATE KEY UPDATE plate_no = VALUES(plate_no)
    `,
    [plate_text]
  );

  const [[row]] = await conn.query(
    `SELECT plate_id FROM plates WHERE plate_no = ? LIMIT 1`,
    [plate_text]
  );

  return { plateId: row.plate_id };
}

async function startConsumer() {
  const conn = await amqp.connect(RABBIT_URL);
  const channel = await conn.createChannel();
  await channel.assertQueue(QUEUE_NAME, { durable: true });

  console.log("🟢 RabbitMQ consumer started:", { QUEUE_NAME, pid: process.pid });

  channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return;

    // 메시지 단위 트랜잭션 처리(중간 실패 시 롤백)
    const db = await pool.getConnection();

    try {
      const data = JSON.parse(msg.content.toString());

      const {
        event_id,
        event_type_code, // ✅ event_types의 코드값
        camera_code,     // ✅ cameras.camera_code
        device_code,     // ✅ devices.device_code
        camera_role,     // 선택
        spot_id,         // 선택
        plate_text,      // 선택
        confidence,      // 선택
        ts,              // ISO string
        image_ref,       // 선택
        payload,         // 선택(JSON)
      } = data;

      // ts 검증
      const tsDate = new Date(ts);
      if (Number.isNaN(tsDate.getTime())) {
        throw new Error(`Invalid ts format: ${ts}`);
      }
      const tsMysql = toMySQLDateTime(tsDate);

      // 기본값 보정(장비/카메라 코드가 없으면 처리 불가)
      if (!device_code || !camera_code) {
        throw new Error("device_code and camera_code are required.");
      }
      if (!event_id || !event_type_code) {
        throw new Error("event_id and event_type_code are required.");
      }

      await db.beginTransaction();

      // 1) device/camera 확보(없으면 생성)
      const { deviceId, cameraId } = await ensureDeviceAndCamera(db, {
        device_code,
        camera_code,
        camera_role,
      });

      // 2) plate 확보(없으면 생성)
      const { plateId } = await ensurePlate(db, plate_text);

      // 3) cameras.last_seen_at 갱신 (카메라 정상 작동 체크용)
      await db.query(
        `UPDATE cameras SET last_seen_at = ? WHERE camera_id = ?`,
        [tsMysql, cameraId]
      );

      // 4) camera_heartbeat 이력(heartbeat 이벤트면 기록)
      if (event_type_code === "camera_heartbeat") {
        await db.query(
          `
          INSERT INTO camera_heartbeats (camera_id, status, message, created_at)
          VALUES (?, 'online', ?, ?)
          `,
          [cameraId, "heartbeat", tsMysql]
        );
      }

      // 5) parking_events 저장(핵심 이벤트 테이블)
      //    event_id가 PK라 중복이면 에러 -> 이미 처리된 메시지로 판단 가능
      await db.query(
        `
        INSERT INTO parking_events
          (event_id, spot_id, device_id, camera_id, event_type_code, plate_id, payload_json, created_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          event_id,
          spot_id || null,
          deviceId,
          cameraId,
          event_type_code,
          plateId,
          payload ? JSON.stringify(payload) : JSON.stringify(data),
          tsMysql,
        ]
      );

      // 6) 번호판 인식 로그(lpr_reads) - plate_detected일 때
      if (event_type_code === "plate_detected" && plate_text) {
        await db.query(
          `
          INSERT INTO lpr_reads
            (event_id, camera_id, plate_id, plate_text, confidence, image_ref, created_at)
          VALUES
            (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            confidence = VALUES(confidence),
            image_ref  = VALUES(image_ref)
          `,
          [event_id, cameraId, plateId, plate_text, confidence ?? null, image_ref ?? null, tsMysql]
        );
      }

      // 7) 주차면 상태 로그(spot_status_logs) - spot_id 있으면 스냅샷 적재
      //    occupancy는 payload.is_occupied가 있으면 사용, 없으면 "차량 감지면 점유=1"로 간주
      let is_occupied = 1;

      if (spot_id) {
        is_occupied =
          payload && typeof payload.is_occupied === "number"
            ? payload.is_occupied
            : 1;

        await db.query(
          `
          INSERT INTO spot_status_logs
            (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
          VALUES
            (?, ?, ?, ?, ?, ?)
          `,
          [spot_id, deviceId, is_occupied, plateId, confidence ?? null, tsMysql]
        );
      }

      // vehicle_sessions 매핑은 폴링 루프(resolvePendingSessions)에서만 처리
      // — RabbitMQ 즉시 매핑 시 차를 올리는 순간 경계를 스친 칸이 먼저 매핑되는 문제 방지

      // 8-a) is_occupied=0: 차량이 구역을 떠남 → open 위반 자동 해제
      if (spot_id && is_occupied === 0) {
        const [result] = await db.query(
          `
          UPDATE violations
          SET violation_status_code = 'resolved', resolved_at = ?
          WHERE spot_id = ? AND violation_status_code = 'open'
          `,
          [tsMysql, spot_id]
        );
        if (result.affectedRows > 0) {
          console.log(`✅ 차량 떠남 → 위반 자동 해제: spot=${spot_id}`);
        }
      }

      // 8-b) 불법주차(금지면) 처리: spot_type_code='forbidden'이면 open 위반 생성 + evidence
      //    번호판 없어도(plateId=null) 금지면 점유 시 위반 생성
      if (spot_id && is_occupied !== 0) {
        const [[spotRow]] = await db.query(
          `SELECT spot_type_code FROM parking_spots WHERE spot_id = ? LIMIT 1`,
          [spot_id]
        );

        if (spotRow && spotRow.spot_type_code === "forbidden") {
          // open 위반 존재 여부 확인 (같은 spot+type+open, 번호판 무관)
          const [openRows] = await db.query(
            `
            SELECT violation_id FROM violations
            WHERE spot_id = ?
              AND violation_type_code = 'forbidden_occupied'
              AND violation_status_code = 'open'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [spot_id]
          );

          let violationId;

          if (openRows.length === 0) {
            const [vRes] = await db.query(
              `
              INSERT INTO violations
                (spot_id, camera_id, plate_id, violation_type_code, violation_status_code, created_at)
              VALUES
                (?, ?, ?, 'forbidden_occupied', 'open', ?)
              `,
              [spot_id, cameraId, plateId, tsMysql]
            );
            violationId = vRes.insertId;

            console.log("🚨 New violation created:", {
              violationId,
              spot_id,
              plate_text,
              event_id,
            });
          } else {
            violationId = openRows[0].violation_id;
            console.log("🚨 Violation exists, append evidence:", {
              violationId,
              spot_id,
              plate_text,
              event_id,
            });
          }

          // 증거 저장(evidences)
          // file_ref는 아직 실제 이미지가 없으니, image_ref가 있으면 쓰고 없으면 event_id 기반으로 placeholder
          const fileRef = image_ref || `event:${event_id}`;

          await db.query(
            `
            INSERT INTO evidences (event_id, violation_id, file_ref, created_at)
            VALUES (?, ?, ?, ?)
            `,
            [event_id, violationId, fileRef, tsMysql]
          );
        }
      }

      await db.commit();
      channel.ack(msg);

      console.log("✅ DB updated:", { event_id, event_type_code, spot_id, plate_text, tsMysql });
    } catch (err) {
      try { await db.rollback(); } catch {}
      console.error("❌ Consumer error:", err.message);

      // 재큐잉하면 무한 반복될 수 있으니 false
      channel.nack(msg, false, false);
    } finally {
      db.release();
    }
  });
}

startConsumer().catch((e) => {
  console.error("❌ Consumer fatal:", e);
  process.exit(1);
});

// pending 세션이 있는데 AI가 새 메시지를 안 보낼 때를 대비한 폴링
// (이미 점유된 칸 위에 차를 올려놓으면 상태 변화가 없어 RabbitMQ 메시지가 오지 않음)
async function resolvePendingSessions() {
  try {
    const [[pending]] = await pool.query(
      `SELECT color, entered_at FROM vehicle_sessions WHERE status = 'pending' ORDER BY entered_at ASC LIMIT 1`
    );
    if (!pending) return;

    // 조건:
    // 1) 현재 is_occupied=1 (최신 로그)
    // 2) 그 이후로 is_occupied=0 이 없음 (안정적으로 점유 중)
    // 3) pending 세션 생성 이후에 점유됨
    // 4) 이미 parked된 세션 없음
    // 5) 금지구역 제외
    const [stableSpots] = await pool.query(`
      SELECT latest.spot_id, latest.max_at
      FROM (
        SELECT spot_id, MAX(captured_at) AS max_at
        FROM spot_status_logs
        GROUP BY spot_id
      ) latest
      JOIN spot_status_logs slog
        ON slog.spot_id = latest.spot_id AND slog.captured_at = latest.max_at
      JOIN parking_spots ps ON ps.spot_id = latest.spot_id
      WHERE slog.is_occupied = 1
        AND ps.spot_type_code != 'forbidden'
        AND ps.is_active = 1
        AND latest.max_at > DATE_ADD(?, INTERVAL 8 SECOND)
        AND slog.spot_id NOT IN (
          SELECT spot_id FROM vehicle_sessions WHERE status = 'parked' AND spot_id IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM spot_status_logs
          WHERE spot_id = latest.spot_id
            AND is_occupied = 0
            AND captured_at > latest.max_at
        )
      ORDER BY COALESCE(slog.confidence, 0) DESC
      LIMIT 1
    `, [pending.entered_at]);

    if (stableSpots.length === 0) return;

    const spot_id = stableSpots[0].spot_id;
    await pool.query(
      `UPDATE vehicle_sessions SET spot_id = ?, status = 'parked' WHERE color = ?`,
      [spot_id, pending.color]
    );
    console.log(`[polling] ${pending.color} -> ${spot_id} 매핑 완료`);
  } catch (err) {
    console.error('[polling] 오류:', err.message);
  }
}

setInterval(resolvePendingSessions, 3000);
