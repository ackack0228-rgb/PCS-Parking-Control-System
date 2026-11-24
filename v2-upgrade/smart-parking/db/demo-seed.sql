-- 발표용 선호 주차칸 시드 데이터 (모형 3칸: A1-001, A1-002, A1-003)
-- 실행: docker exec -i smartparking-mysql mysql --default-character-set=utf8mb4 -uapp -papppass smartparking < db/demo-seed.sql
SET NAMES utf8mb4;
SET time_zone = '+09:00';

-- 모형에 사용할 3개 주차면 등록 (A1-002, A1-003은 신규 / A1-001은 seed.sql에 이미 존재)
INSERT INTO parking_spots (spot_id, zone, floor, spot_type_code, is_active) VALUES
('A1-002','A1','1F','normal',1),
('A1-003','A1','1F','normal',1)
ON DUPLICATE KEY UPDATE zone=VALUES(zone), floor=VALUES(floor), is_active=1;

-- 모형에 없는 스팟은 비활성화 (통계에서 제외됨)
UPDATE parking_spots SET is_active=0
WHERE spot_id NOT IN ('A1-001','A1-002','A1-003','A1-999');

-- 김근영 번호판 등록
INSERT INTO plates (plate_no) VALUES ('12가3456')
ON DUPLICATE KEY UPDATE plate_no=plate_no;

-- 정문영 번호판 등록 (파란 차)
INSERT INTO plates (plate_no) VALUES ('34나5678')
ON DUPLICATE KEY UPDATE plate_no=plate_no;

-- 박지민 번호판 등록 (회색 차)
INSERT INTO plates (plate_no) VALUES ('56다9012')
ON DUPLICATE KEY UPDATE plate_no=plate_no;

-- 기존 선호 주차칸 로그 초기화 (중복 실행 방지)
DELETE FROM spot_status_logs WHERE spot_id IN ('A1-001','A1-002','A1-003');

-- ── A1-003 : 6회 (1위, 43%) ──────────────────────────────
INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-003', d.device_id, 1, p.plate_id, 0.94, DATE_SUB(NOW(), INTERVAL n DAY)
FROM (SELECT 1 n UNION SELECT 4 UNION SELECT 7 UNION SELECT 10 UNION SELECT 13 UNION SELECT 16) nums,
     devices d, plates p
WHERE d.device_code='PI-01' AND p.plate_no='12가3456';

-- ── A1-001 : 5회 (2위, 36%) ──────────────────────────────
INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-001', d.device_id, 1, p.plate_id, 0.91, DATE_SUB(NOW(), INTERVAL n DAY)
FROM (SELECT 2 n UNION SELECT 6 UNION SELECT 11 UNION SELECT 17 UNION SELECT 21) nums,
     devices d, plates p
WHERE d.device_code='PI-01' AND p.plate_no='12가3456';

-- ── A1-002 : 3회 (3위, 21%) ──────────────────────────────
INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-002', d.device_id, 1, p.plate_id, 0.89, DATE_SUB(NOW(), INTERVAL n DAY)
FROM (SELECT 3 n UNION SELECT 9 UNION SELECT 18) nums,
     devices d, plates p
WHERE d.device_code='PI-01' AND p.plate_no='12가3456';

-- ── 현재 상태: A1-003 비어있음(✅), A1-001 사용 중(❌), A1-002 비어있음(✅) ──
INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-003', d.device_id, 0, NULL, 0.99, NOW()
FROM devices d WHERE d.device_code='PI-01';

INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-001', d.device_id, 1, p.plate_id, 0.97, NOW()
FROM devices d, plates p
WHERE d.device_code='PI-01' AND p.plate_no='12가3456';

INSERT INTO spot_status_logs (spot_id, device_id, is_occupied, plate_id, confidence, captured_at)
SELECT 'A1-002', d.device_id, 0, NULL, 0.99, NOW()
FROM devices d WHERE d.device_code='PI-01';

-- ── 주차 이력 샘플 (김근영·정문영·박지민 각 3건) ──────────────
DELETE FROM vehicle_session_history WHERE plate_no IN ('12가3456','34나5678','56다9012');

-- 김근영 (12가3456)
INSERT INTO vehicle_session_history (plate_no, spot_id, zone, entered_at, exited_at) VALUES
('12가3456', 'A1-003', 'A1',
  DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 14 HOUR + INTERVAL 20 MINUTE,
  DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 16 HOUR + INTERVAL 2  MINUTE),
('12가3456', 'A1-001', 'A1',
  DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL  9 HOUR + INTERVAL 10 MINUTE,
  DATE_SUB(NOW(), INTERVAL 3 DAY) + INTERVAL 12 HOUR + INTERVAL 15 MINUTE),
('12가3456', 'A1-003', 'A1',
  DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 18 HOUR,
  DATE_SUB(NOW(), INTERVAL 5 DAY) + INTERVAL 20 HOUR + INTERVAL 30 MINUTE);

-- 정문영 (34나5678)
INSERT INTO vehicle_session_history (plate_no, spot_id, zone, entered_at, exited_at) VALUES
('34나5678', 'A1-002', 'A1',
  DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 10 HOUR,
  DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 45 MINUTE),
('34나5678', 'A1-001', 'A1',
  DATE_SUB(NOW(), INTERVAL 4 DAY) + INTERVAL 8 HOUR + INTERVAL 30 MINUTE,
  DATE_SUB(NOW(), INTERVAL 4 DAY) + INTERVAL 10 HOUR),
('34나5678', 'A1-002', 'A1',
  DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 19 HOUR,
  DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 20 HOUR + INTERVAL 20 MINUTE);

-- 박지민 (56다9012)
INSERT INTO vehicle_session_history (plate_no, spot_id, zone, entered_at, exited_at) VALUES
('56다9012', 'A1-001', 'A1',
  DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 15 HOUR,
  DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 17 HOUR + INTERVAL 30 MINUTE),
('56다9012', 'A1-003', 'A1',
  DATE_SUB(NOW(), INTERVAL 6 DAY) + INTERVAL 7 HOUR,
  DATE_SUB(NOW(), INTERVAL 6 DAY) + INTERVAL 8 HOUR + INTERVAL 50 MINUTE),
('56다9012', 'A1-001', 'A1',
  DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 12 HOUR,
  DATE_SUB(NOW(), INTERVAL 10 DAY) + INTERVAL 13 HOUR + INTERVAL 40 MINUTE);

-- ── 현재 주차 중인 차량 세션 ─────────────────────────────
-- 위 "현재 상태"에서 A1-001을 12가3456(김근영, 빨간 차)이 점유 중으로 넣었으므로
-- vehicle_sessions에도 parked 세션을 맞춰 둔다.
-- (없으면 /spots/forbidden-occupied가 A1-001을 '이중주차'로 오탐한다)
REPLACE INTO vehicle_sessions (color, plate_no, spot_id, entered_at, status)
VALUES ('red', '12가3456', 'A1-001', DATE_SUB(NOW(), INTERVAL 40 MINUTE), 'parked');
