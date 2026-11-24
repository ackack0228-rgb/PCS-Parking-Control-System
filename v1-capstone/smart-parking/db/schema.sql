-- =========================================================
-- Smart Parking System - schema.sql (MySQL 8.x)
-- ---------------------------------------------------------
-- 목적:
-- 1) "스키마(테이블/제약조건/인덱스)"만 생성
-- 2) 테스트/운영 데이터를 넣지 않음 (seed.sql로 분리)
--
-- 적용 방법(예시):
--   mysql -uapp -papppass smartparking < db/schema.sql
--
-- 주의:
-- - 이 파일은 DROP TABLE을 포함하므로 "기존 데이터 삭제"됨.
-- - 개발 중 초기화/재구성에 사용.
-- =========================================================

SET NAMES utf8mb4;
SET time_zone = '+09:00';          -- 한국 시간 기준 통일 (이벤트/로그 시간 혼선 방지)

-- FK 끄고 DROP -> 다시 켜고 CREATE (정석)
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 0) DROP TABLES (FK 역순으로 삭제)
--    - 자식(참조하는 쪽)부터 삭제해야 FK 오류가 안 난다.
-- =========================================================
DROP TABLE IF EXISTS violation_actions;
DROP TABLE IF EXISTS evidences;
DROP TABLE IF EXISTS violations;

DROP TABLE IF EXISTS vehicle_session_history;
DROP TABLE IF EXISTS vehicle_sessions;
DROP TABLE IF EXISTS parking_sessions;
DROP TABLE IF EXISTS lpr_reads;
DROP TABLE IF EXISTS camera_heartbeats;
DROP TABLE IF EXISTS camera_zones;

DROP TABLE IF EXISTS parking_events;
DROP TABLE IF EXISTS spot_status_logs;
DROP TABLE IF EXISTS parking_spots;

DROP TABLE IF EXISTS action_types;
DROP TABLE IF EXISTS violation_statuses;
DROP TABLE IF EXISTS violation_types;
DROP TABLE IF EXISTS event_types;
DROP TABLE IF EXISTS spot_types;

DROP TABLE IF EXISTS cameras;
DROP TABLE IF EXISTS devices;

DROP TABLE IF EXISTS visitor_passes;
DROP TABLE IF EXISTS user_vehicles;
DROP TABLE IF EXISTS plates;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 1) USERS
-- ---------------------------------------------------------
-- 역할:
-- - 관리자(admin), 입주민(resident) 계정 저장
-- - 방문차량은 계정 없이 plate만으로 처리 가능(정책에 따라 확장)
-- =========================================================
CREATE TABLE users (
  user_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(50)  NOT NULL,
  phone          VARCHAR(20)  UNIQUE,
  email          VARCHAR(100) UNIQUE,
  role           VARCHAR(20)  NOT NULL,          -- 'admin', 'resident'
  building       VARCHAR(20),                    -- 동
  unit_no        VARCHAR(20),                    -- 호
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at  DATETIME NULL,

  -- 인덱스: 관리자/입주민 필터, 가입일 정렬 등에 사용
  KEY idx_users_role (role),
  KEY idx_users_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 2) PLATES (번호판 마스터)
-- ---------------------------------------------------------
-- 역할:
-- - 번호판 문자열(plate_no)을 정규화하여 ID로 관리
-- - 이후 테이블들은 plate_id(FK)로 연결
-- =========================================================
CREATE TABLE plates (
  plate_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  plate_no       VARCHAR(20) NOT NULL UNIQUE,    -- 예: "12가3456"
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_plates_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 3) USER_VEHICLES (사용자-번호판 연결)
-- ---------------------------------------------------------
-- 역할:
-- - 입주민이 등록한 차량 목록
-- - user_id + plate_id 유니크로 중복 등록 방지
-- =========================================================
CREATE TABLE user_vehicles (
  user_vehicle_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  plate_id        BIGINT NOT NULL,
  alias           VARCHAR(30),                   -- 예: "아빠차"
  is_primary      TINYINT(1) NOT NULL DEFAULT 0, -- 대표 차량
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_uv_user  FOREIGN KEY (user_id)  REFERENCES users(user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_uv_plate FOREIGN KEY (plate_id) REFERENCES plates(plate_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  UNIQUE KEY uq_user_plate (user_id, plate_id),
  KEY idx_uv_user (user_id),
  KEY idx_uv_plate (plate_id),
  KEY idx_uv_primary (user_id, is_primary)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 4) DEVICES (물리 장치) ✅ consumer 에러의 핵심
-- ---------------------------------------------------------
-- 역할:
-- - Jetson / Raspberry Pi / Camera Box 등 "장치" 단위 관리
-- - device_code를 고유 식별자로 사용 (예: 'PI-01', 'JETSON-01')
--
-- 왜 필요?
-- - consumer가 이벤트에서 device_code를 받아 DB에서 device_id로 매핑/확인한다.
-- - 이 테이블이 없으면 바로:
--   ❌ Table 'smartparking.devices' doesn't exist
-- =========================================================
CREATE TABLE devices (
  device_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_code    VARCHAR(50) NOT NULL UNIQUE,
  device_type    VARCHAR(30) NOT NULL,           -- 'jetson','pi','camera','sensor' 등
  location_desc  VARCHAR(100),
  installed_at   DATETIME NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at   DATETIME NULL,
  last_error     VARCHAR(255) NULL,

  KEY idx_devices_type (device_type),
  KEY idx_devices_active (is_active),
  KEY idx_devices_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 5) CAMERAS (영상 스트림/카메라 논리 단위)
-- ---------------------------------------------------------
-- 역할:
-- - 프론트에서 "카메라 카드"로 보여줄 엔티티
-- - device는 물리 장치, camera는 영상 스트림 개념 (1:N 가능)
--
-- FK 정책:
-- - device 제거/교체 시 camera는 남길 수 있으므로 SET NULL
-- =========================================================
CREATE TABLE cameras (
  camera_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  camera_code    VARCHAR(50) NOT NULL UNIQUE,     -- 예: CAM-PARK-01, CAM-GATE-01
  device_id      BIGINT NULL,
  camera_role    VARCHAR(30) NOT NULL,            -- 'parking_view' / 'gate_lpr'
  location_desc  VARCHAR(100) NULL,
  stream_url     VARCHAR(255) NULL,               -- rtsp/http 등
  is_enabled     TINYINT(1) NOT NULL DEFAULT 1,
  last_seen_at   DATETIME NULL,
  last_error     VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_cameras_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_cameras_role (camera_role),
  KEY idx_cameras_seen (last_seen_at),
  KEY idx_cameras_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 6) CODE TABLES (코드/명칭 테이블)
-- ---------------------------------------------------------
-- 역할:
-- - 고정 분류값을 코드화하여 FK로 관리(오타/불일치 방지)
-- - seed.sql에서 기본값을 삽입한다.
-- =========================================================
CREATE TABLE spot_types (
  spot_type_code VARCHAR(30) PRIMARY KEY,         -- 'normal','visitor','disabled','forbidden',...
  spot_type_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE event_types (
  event_type_code VARCHAR(30) PRIMARY KEY,        -- 'plate_detected','spot_status','camera_heartbeat',...
  event_type_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE violation_types (
  violation_type_code VARCHAR(30) PRIMARY KEY,    -- 'forbidden_occupied','double_parking','overtime',...
  violation_type_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE violation_statuses (
  violation_status_code VARCHAR(30) PRIMARY KEY,  -- 'open','resolved','dismissed'
  violation_status_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE action_types (
  action_type_code VARCHAR(30) PRIMARY KEY,       -- 'notify','warning','ticket','resolve','dismiss'
  action_type_name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 7) PARKING_SPOTS (주차면 마스터)
-- ---------------------------------------------------------
-- 역할:
-- - 주차면/구역/층/타입을 정의
-- - spot_type_code로 금지면/방문자면 등 분류
-- =========================================================
CREATE TABLE parking_spots (
  spot_id        VARCHAR(20) PRIMARY KEY,         -- 예: A1-001
  zone           VARCHAR(20) NOT NULL,            -- 예: A1
  floor          VARCHAR(10),
  spot_type_code VARCHAR(30) NOT NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,

  CONSTRAINT fk_spot_type FOREIGN KEY (spot_type_code) REFERENCES spot_types(spot_type_code)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  KEY idx_spots_zone (zone),
  KEY idx_spots_floor (floor),
  KEY idx_spots_type (spot_type_code),
  KEY idx_spots_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 8) SPOT_STATUS_LOGS (주차면 상태 로그)
-- ---------------------------------------------------------
-- 역할:
-- - AI가 판단한 점유/비점유 스냅샷 로그를 누적
-- - "현재 상태 테이블"이 아니라 "로그"이므로
--   API에서는 spot_id별 최신 1건을 뽑아 현재 상태처럼 사용
-- =========================================================
CREATE TABLE spot_status_logs (
  status_log_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
  spot_id        VARCHAR(20) NOT NULL,
  device_id      BIGINT NOT NULL,
  is_occupied    TINYINT(1) NOT NULL,             -- 1: 점유, 0: 비점유
  plate_id       BIGINT NULL,                     -- 관측된 번호판(없을 수 있음)
  confidence     DECIMAL(5,4) NULL,               -- 0.0000 ~ 1.0000
  captured_at    DATETIME NOT NULL,               -- AI 판단 시각(이벤트 시각)

  CONSTRAINT fk_ssl_spot   FOREIGN KEY (spot_id)   REFERENCES parking_spots(spot_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ssl_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ssl_plate  FOREIGN KEY (plate_id)  REFERENCES plates(plate_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_ssl_spot_time (spot_id, captured_at),
  KEY idx_ssl_plate_time (plate_id, captured_at),
  KEY idx_ssl_device_time (device_id, captured_at),
  KEY idx_ssl_occupied_time (is_occupied, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 9) PARKING_EVENTS (모든 이벤트의 정본)
-- ---------------------------------------------------------
-- 역할:
-- - RabbitMQ로 들어오는 모든 이벤트를 event_id 기준으로 저장
-- - 분석/리플레이/감사 로그의 기준 테이블
--
-- 주의:
-- - event_type_code는 event_types FK
-- - producer/consumer가 보내는 event_type_code 값과 seed.sql 코드값을 반드시 맞춰야 함.
-- =========================================================
CREATE TABLE parking_events (
  event_id        VARCHAR(60) PRIMARY KEY,        -- UUID or custom string
  spot_id         VARCHAR(20) NULL,
  device_id       BIGINT NOT NULL,
  camera_id       BIGINT NULL,
  event_type_code VARCHAR(30) NOT NULL,
  plate_id        BIGINT NULL,
  payload_json    JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_pe_spot   FOREIGN KEY (spot_id) REFERENCES parking_spots(spot_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_pe_device FOREIGN KEY (device_id) REFERENCES devices(device_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_pe_camera FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_pe_type   FOREIGN KEY (event_type_code) REFERENCES event_types(event_type_code)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_pe_plate  FOREIGN KEY (plate_id) REFERENCES plates(plate_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_pe_time (created_at),
  KEY idx_pe_spot_time (spot_id, created_at),
  KEY idx_pe_plate_time (plate_id, created_at),
  KEY idx_pe_camera_time (camera_id, created_at),
  KEY idx_pe_type_time (event_type_code, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 10) CAMERA_ZONES (ROI/라인 정의)
-- ---------------------------------------------------------
-- 역할:
-- - 카메라별 관심영역/라인을 JSON으로 저장
-- - "금지구역 ROI", "입차선/출차선" 같은 규칙 확장 가능
-- =========================================================
CREATE TABLE camera_zones (
  zone_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  camera_id     BIGINT NOT NULL,
  zone_code     VARCHAR(60) NOT NULL UNIQUE,      -- 예: CAM-GATE-01_ENTRY_LINE
  zone_type     VARCHAR(30) NOT NULL,             -- FORBIDDEN / ENTRY_LINE / EXIT_LINE / PARKING_AREA
  polygon_json  JSON NOT NULL,
  is_enabled    TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_cz_camera FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  KEY idx_cz_camera (camera_id),
  KEY idx_cz_type (zone_type),
  KEY idx_cz_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 11) CAMERA_HEARTBEATS (카메라 상태 이력)
-- ---------------------------------------------------------
-- 역할:
-- - 카메라 상태(online/offline/degraded)를 시간순으로 기록
-- - UI에서 온라인 상태 표시 근거
-- =========================================================
CREATE TABLE camera_heartbeats (
  heartbeat_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
  camera_id     BIGINT NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'online', -- online/offline/degraded
  fps           DECIMAL(6,2) NULL,
  message       VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_ch_camera FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  KEY idx_ch_camera_time (camera_id, created_at),
  KEY idx_ch_status_time (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 12) LPR_READS (번호판 인식 로그)
-- ---------------------------------------------------------
-- 역할:
-- - plate_detected 이벤트에 대한 상세 로그
-- - event_id와 1:1 관계를 만들기 위해 UNIQUE(event_id) 사용
-- =========================================================
CREATE TABLE lpr_reads (
  lpr_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id      VARCHAR(60) NOT NULL,
  camera_id     BIGINT NOT NULL,
  plate_id      BIGINT NULL,
  plate_text    VARCHAR(20) NOT NULL,
  confidence    DECIMAL(5,4) NULL,
  image_ref     VARCHAR(255) NULL,                -- S3 key / 로컬 경로 등
  bbox_json     JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_lpr_event  FOREIGN KEY (event_id)  REFERENCES parking_events(event_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_lpr_camera FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_lpr_plate  FOREIGN KEY (plate_id)  REFERENCES plates(plate_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  UNIQUE KEY uq_lpr_event (event_id),
  KEY idx_lpr_plate_time (plate_text, created_at),
  KEY idx_lpr_camera_time (camera_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 13) PARKING_SESSIONS (입차~출차 세션)
-- ---------------------------------------------------------
-- 역할:
-- - gate_lpr에서 ENTRY/EXIT 구분 가능해지면
--   한 차량의 입차~출차를 하나의 세션으로 묶는다.
-- - 지금은 확장 대비용 테이블
-- =========================================================
CREATE TABLE parking_sessions (
  session_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  plate_id        BIGINT NULL,
  plate_text      VARCHAR(20) NOT NULL,           -- plate_id가 없어도 기록 가능하게 text 유지
  vehicle_class   VARCHAR(20) NOT NULL DEFAULT 'unknown', -- resident/visitor/unknown
  entry_time      DATETIME NOT NULL,
  exit_time       DATETIME NULL,

  entry_camera_id BIGINT NULL,
  exit_camera_id  BIGINT NULL,
  entry_event_id  VARCHAR(60) NULL,
  exit_event_id   VARCHAR(60) NULL,

  status          VARCHAR(20) NOT NULL DEFAULT 'open',    -- open/closed
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_ps_plate       FOREIGN KEY (plate_id)        REFERENCES plates(plate_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ps_entry_cam   FOREIGN KEY (entry_camera_id) REFERENCES cameras(camera_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ps_exit_cam    FOREIGN KEY (exit_camera_id)  REFERENCES cameras(camera_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ps_entry_event FOREIGN KEY (entry_event_id)  REFERENCES parking_events(event_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ps_exit_event  FOREIGN KEY (exit_event_id)   REFERENCES parking_events(event_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_ps_plate_time (plate_text, entry_time),
  KEY idx_ps_status (status),
  KEY idx_ps_entry_time (entry_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 14) VIOLATIONS (위반)
-- ---------------------------------------------------------
-- 역할:
-- - 금지면 점유, 이중주차, 시간초과 등 위반 관리
-- - spot 기반 + zone(ROI) 기반 확장 가능
-- =========================================================
CREATE TABLE violations (
  violation_id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  spot_id               VARCHAR(20) NULL,
  zone_id               BIGINT NULL,
  camera_id             BIGINT NULL,
  plate_id              BIGINT NULL,
  violation_type_code   VARCHAR(30) NOT NULL,
  violation_status_code VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at           DATETIME NULL,
  resolved_by_user_id   BIGINT NULL,

  CONSTRAINT fk_v_spot   FOREIGN KEY (spot_id) REFERENCES parking_spots(spot_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_v_zone   FOREIGN KEY (zone_id) REFERENCES camera_zones(zone_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_v_camera FOREIGN KEY (camera_id) REFERENCES cameras(camera_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_v_plate  FOREIGN KEY (plate_id) REFERENCES plates(plate_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_v_type   FOREIGN KEY (violation_type_code) REFERENCES violation_types(violation_type_code)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_v_status FOREIGN KEY (violation_status_code) REFERENCES violation_statuses(violation_status_code)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_v_user   FOREIGN KEY (resolved_by_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_v_status_time (violation_status_code, created_at),
  KEY idx_v_spot_status_time (spot_id, violation_status_code, created_at),
  KEY idx_v_plate_time (plate_id, created_at),
  KEY idx_v_camera_time (camera_id, created_at),
  KEY idx_v_zone_time (zone_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 15) EVIDENCES (증거)
-- ---------------------------------------------------------
-- 역할:
-- - 위반/이벤트에 대한 증거 이미지/파일 저장
-- - file_ref: S3 key / 로컬 경로 / event_id 기반 placeholder 등
-- =========================================================
CREATE TABLE evidences (
  evidence_id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id      VARCHAR(60) NOT NULL,
  violation_id  BIGINT NULL,
  file_ref      VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_e_event     FOREIGN KEY (event_id) REFERENCES parking_events(event_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_e_violation FOREIGN KEY (violation_id) REFERENCES violations(violation_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_e_violation (violation_id),
  KEY idx_e_event (event_id),
  KEY idx_e_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 16) VIOLATION_ACTIONS (위반 처리 이력)
-- ---------------------------------------------------------
-- 역할:
-- - 알림, 경고, 단속, 해결 등의 처리 이력을 남김
-- - actor_user_id는 관리자가 처리했다는 기록에 사용
-- =========================================================
CREATE TABLE violation_actions (
  action_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  violation_id     BIGINT NOT NULL,
  action_type_code VARCHAR(30) NOT NULL,
  actor_user_id    BIGINT NULL,
  action_note      VARCHAR(255),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_va_violation FOREIGN KEY (violation_id) REFERENCES violations(violation_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_va_type      FOREIGN KEY (action_type_code) REFERENCES action_types(action_type_code)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_va_user      FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_va_violation_time (violation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 17) VISITOR_PASSES (방문자 출입증)
-- ---------------------------------------------------------
-- 역할:
-- - 입주민이 등록한 방문자 차량의 출입 승인 요청
-- - 관리자가 승인(approved) / 거절(rejected) 처리
-- =========================================================
CREATE TABLE visitor_passes (
  pass_id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  visitor_name  VARCHAR(50) NOT NULL,
  plate_no      VARCHAR(20) NULL,            -- 방문 차량 번호판
  host_user_id  BIGINT NULL,                 -- 초대한 입주민
  visit_date    DATE NOT NULL,               -- 방문 날짜
  visit_time    VARCHAR(50) NULL,            -- 예: "14:00 ~ 18:00"
  expiration_at DATETIME NULL,               -- 출입증 만료 시각
  purpose       VARCHAR(100) NULL,           -- 방문 목적
  status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending/approved/rejected
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_vp_host FOREIGN KEY (host_user_id) REFERENCES users(user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  KEY idx_vp_status (status),
  KEY idx_vp_date (visit_date),
  KEY idx_vp_host (host_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 18) VEHICLE_SESSIONS (색깔 기반 차량 세션 — 데모용)
-- ---------------------------------------------------------
-- 색깔(red/blue/gray) → 현재 주차 칸 매핑을 추적한다.
-- pending: 입차했지만 AI가 칸을 아직 감지 못함
-- parked : AI가 어느 칸인지 확정
-- exited : 출차 완료
-- =========================================================
CREATE TABLE vehicle_sessions (
  color       VARCHAR(20) NOT NULL PRIMARY KEY,  -- 'red' | 'blue' | 'gray'
  plate_no    VARCHAR(20) NOT NULL,
  spot_id     VARCHAR(20) NULL,                  -- AI 감지 후 채워짐
  entered_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 19) VEHICLE_SESSION_HISTORY (주차 이력 — 완료된 세션 기록)
-- ---------------------------------------------------------
-- color-exit 완료 시 vehicle_sessions 데이터를 여기에 INSERT.
-- vehicle_sessions는 color가 PK라 덮어써지므로 과거 기록은 여기서 관리.
-- =========================================================
DROP TABLE IF EXISTS vehicle_session_history;
CREATE TABLE vehicle_session_history (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  plate_no    VARCHAR(20) NOT NULL,
  spot_id     VARCHAR(20) NOT NULL,
  zone        VARCHAR(20),
  entered_at  DATETIME NOT NULL,
  exited_at   DATETIME NOT NULL,

  KEY idx_vsh_plate_time (plate_no, exited_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- 끝
-- =========================================================
