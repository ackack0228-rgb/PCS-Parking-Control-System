/**
 * backend/producer.js
 * ------------------------------------------------------------
 * ✅ 목적:
 * - 하드웨어(젯슨/라즈베리/웹캠)가 없어도 시스템을 end-to-end로 테스트하기 위한 이벤트 발행기
 *
 * ✅ 모드:
 * 1) 기본(번호판 이벤트 1회): node producer.js
 * 2) 금지면 테스트(불법주차 생성): node producer.js --forbidden
 * 3) 하트비트(5초마다 카메라 생존): node producer.js --heartbeat
 *
 * ✅ 주의:
 * - event_type_code는 반드시 DB event_types에 존재해야 FK 통과
 * - forbidden 테스트는 parking_spots에 spot_type_code='forbidden'인 스팟이 있어야 위반 생성됨
 *   (우리가 seed.sql에서 A1-999를 forbidden으로 만들어두는 걸 추천)
 */

require("dotenv").config();

const amqp = require("amqplib");
const { randomUUID } = require("crypto");

const RABBIT_URL = process.env.RABBIT_URL || "amqp://app:apppass@localhost:5672";
const QUEUE_NAME = process.env.RABBIT_QUEUE || "ai.events";

const args = process.argv.slice(2);
const heartbeatMode = args.includes("--heartbeat");
const forbiddenMode = args.includes("--forbidden");

/**
 * 큐에 메시지 1건 전송
 */
async function sendOnce(ch, msg) {
  ch.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(msg)), { persistent: true });
  console.log("📤 Sent", msg);
}

/**
 * 번호판 이벤트(plate_detected) 생성
 * - spot_id는 normal/forbidden 테스트용으로 선택 가능
 */
function buildPlateEvent({ spot_id }) {
  return {
    event_id: randomUUID(),
    event_type_code: "plate_detected", // seed.sql event_types에 있어야 함

    // 장비/카메라(코드 기준으로 DB에 자동 생성됨)
    device_code: "PI-01",
    device_type: "pi",
    camera_code: "CAM-GATE-01",
    camera_role: "gate_lpr",

    // 주차면
    spot_id,

    // 인식 정보
    plate_text: "12가3456",
    confidence: 0.93,

    // 시간
    ts: new Date().toISOString(),

    // 실제 이미지가 아직 없으니 null (나중에 S3 key 등 넣으면 됨)
    image_ref: null,

    // 추가 메타
    payload: { is_occupied: 1 },
  };
}

/**
 * 카메라 하트비트 이벤트 생성
 * - 차가 없을 때도 카메라 online 유지 시연 가능
 */
function buildHeartbeatEvent() {
  return {
    event_id: randomUUID(),
    event_type_code: "camera_heartbeat", // seed.sql에 추가해둬야 함

    device_code: "PI-01",
    device_type: "pi",
    camera_code: "CAM-GATE-01",
    camera_role: "gate_lpr",

    ts: new Date().toISOString(),

    payload: { status: "online" },
  };
}

async function main() {
  const conn = await amqp.connect(RABBIT_URL);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE_NAME, { durable: true });

  // 1) 하트비트 모드
  if (heartbeatMode) {
    console.log("🫀 Heartbeat mode ON: send every 5 seconds (Ctrl+C to stop).");

    // 시작 즉시 1회 발행
    await sendOnce(ch, buildHeartbeatEvent());

    // 5초마다 반복 발행
    setInterval(async () => {
      try {
        await sendOnce(ch, buildHeartbeatEvent());
      } catch (e) {
        console.error("❌ Heartbeat send error:", e.message);
      }
    }, 5000);

    // interval 때문에 종료하지 않음
    return;
  }

  // 2) forbidden 테스트 모드
  if (forbiddenMode) {
    // seed.sql에 A1-999를 forbidden으로 만들어두면 여기서 바로 위반 생성됨
    const msg = buildPlateEvent({ spot_id: "A1-999" });
    await sendOnce(ch, msg);
    await ch.close();
    await conn.close();
    return;
  }

  // 3) 기본: 정상 스팟 이벤트 1회
  const msg = buildPlateEvent({ spot_id: "A1-001" });
  await sendOnce(ch, msg);

  await ch.close();
  await conn.close();
}

main().catch(console.error);
