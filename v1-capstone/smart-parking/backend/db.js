/**
 * backend/db.js
 * ------------------------------------------------------------
 * ✅ 목적:
 * - MySQL 커넥션 풀을 "단일 파일"에서 생성해 재사용하기 위함
 * - consumer.js / routes / app.js 등 여러 파일이 DB를 사용하므로
 *   매번 연결을 새로 만들면 비효율적 + 커넥션 폭주 위험
 *
 * ✅ 특징:
 * - mysql2/promise 기반 (async/await)
 * - connectionLimit으로 최대 동시 커넥션 제한
 */

const mysql = require("mysql2/promise");

// 환경변수(없으면 기본값)
const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USER || "app";
const password = process.env.DB_PASSWORD || "apppass";
const database = process.env.DB_NAME || "smartparking";

/**
 * createPool:
 * - 커넥션을 필요할 때 빌려오고(db.getConnection)
 * - 쿼리 끝나면 반납(release)
 * - 여러 요청이 동시에 와도 pool이 관리
 */
const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,

  // 대기열/커넥션 제한
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  // timezone은 schema.sql에서 SET time_zone으로 맞춰두는 게 베스트
});

module.exports = pool;
