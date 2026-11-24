SET NAMES utf8mb4;
SET character_set_client = utf8mb4;

INSERT INTO spot_types VALUES
('normal','NORMAL'),
('visitor','VISITOR'),
('disabled','DISABLED'),
('forbidden','FORBIDDEN');

INSERT INTO violation_statuses VALUES
('open','OPEN'),
('resolved','RESOLVED'),
('dismissed','DISMISSED');

INSERT INTO violation_types VALUES
('forbidden_occupied','FORBIDDEN_OCCUPIED'),
('double_parking','DOUBLE_PARKING'),
('overtime','OVERTIME');

INSERT INTO action_types VALUES
('notify','NOTIFY'),
('warning','WARNING'),
('ticket','TICKET'),
('resolve','RESOLVE'),
('dismiss','DISMISS');

INSERT INTO event_types VALUES
('plate_detected','PLATE_DETECTED'),
('spot_status','SPOT_STATUS'),
('occupied_changed','OCCUPIED_CHANGED'),
('snapshot','SNAPSHOT'),
('camera_heartbeat','CAMERA_HEARTBEAT');

-- =========================================================
-- TEST DATA (DEV/LOCAL)
-- - producer.js 기본값과 맞추기 위해 최소 데이터 삽입
-- - 중복 실행해도 안전하도록 ON DUPLICATE KEY 사용
-- =========================================================

-- 1) Device: PI-01 (Raspberry Pi)
INSERT INTO devices (device_code, device_type, location_desc, is_active)
VALUES ('PI-01','pi','Gate RaspberryPi',1)
ON DUPLICATE KEY UPDATE
  device_type=VALUES(device_type),
  location_desc=VALUES(location_desc),
  is_active=1;

-- 2) Camera: CAM-GATE-01 (Gate LPR Camera)
-- cameras.device_id는 FK라서 위에서 만든 PI-01의 device_id를 찾아서 넣음
INSERT INTO cameras (camera_code, device_id, camera_role, location_desc, is_enabled)
SELECT 'CAM-GATE-01', d.device_id, 'gate_lpr', 'Gate LPR Camera', 1
FROM devices d
WHERE d.device_code='PI-01'
ON DUPLICATE KEY UPDATE
  camera_role=VALUES(camera_role),
  location_desc=VALUES(location_desc),
  is_enabled=1;

-- 3) Parking spots (producer 기본 spot_id와 일치해야 FK 통과)
-- A1-001 : 정상 주차면
-- A1-999 : 금지구역(불법주차 테스트용)
INSERT INTO parking_spots (spot_id, zone, floor, spot_type_code, is_active) VALUES
('A1-001','A1','1F','normal',1),
('A1-999','A1','1F','forbidden',1)
ON DUPLICATE KEY UPDATE
  zone=VALUES(zone),
  floor=VALUES(floor),
  spot_type_code=VALUES(spot_type_code),
  is_active=1;

-- 4) 테스트 사용자 (회원관리 화면용)
INSERT INTO users (name, phone, email, role, building, unit_no) VALUES
('김근영', '010-1234-5678', 'kim@example.com',   'resident', '101동', '201호'),
('정문영', '010-2345-6789', 'lee@example.com',   'resident', '101동', '305호'),
('박지민', '010-3456-7890', 'park@example.com',  'resident', '102동', '101호'),
('최관리', '010-0000-0001', 'admin@example.com', 'admin',    NULL,    NULL),
('정주민', '010-4567-8901', 'jung@example.com',  'resident', '102동', '402호')
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  role=VALUES(role);

-- 5) 테스트 방문자 출입증 (방문자 승인 화면용)
INSERT INTO visitor_passes (visitor_name, plate_no, visit_date, visit_time, expiration_at, purpose, status) VALUES
('이광수', '45사6789', CURDATE() + INTERVAL 1 DAY, '14:00 ~ 18:00', NOW() + INTERVAL 28 HOUR, '이사 도움', 'pending'),
('이영찬', '67아8901', CURDATE() + INTERVAL 2 DAY, '10:00 ~ 16:00', NOW() + INTERVAL 54 HOUR, '가족 방문', 'pending'),
('이동욱', '89자0123', CURDATE(),                  '13:00 ~ 17:00', NOW() + INTERVAL 4 HOUR,  '택배 수령', 'pending')
ON DUPLICATE KEY UPDATE status=VALUES(status);
  
