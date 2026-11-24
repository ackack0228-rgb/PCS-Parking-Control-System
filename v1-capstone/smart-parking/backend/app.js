/**
 * backend/app.js
 * ------------------------------------------------------------
 * ✅ 목적:
 * - Express API 서버 실행 엔트리 포인트
 * - 프론트가 없어도 브라우저로 API 호출해서 "서버+DB" 동작 검증 가능
 *
 * ✅ 제공:
 * - GET /health   : 서버 살아있는지 확인용(가장 기본)
 * - /api/*        : dashboard.js 라우터 연결
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const dashboardRoutes = require("./routes/dashboard");
const sec = require("./security");

const app = express();
app.disable("x-powered-by");
app.set("query parser", "simple");

/**
 * CORS:
 * - 프론트(React)가 다른 포트(예: 5173)로 돌면 CORS 필요
 * - 지금은 프론트가 없어도 넣어두면 나중에 편함
 */
app.use(cors(sec.corsOptions())); // 허용된 출처(대시보드)만

/**
 * JSON 바디 파싱:
 * - POST/PUT 요청에서 req.body 사용 가능
 */
app.use(express.json({ limit: "20kb" }));
app.use(sec.rateLimit());
app.use(sec.rejectNonPrimitiveInput);

/**
 * 헬스체크:
 * - 서버가 떠있는지 제일 빠르게 확인
 * - DB 연결을 포함하고 싶으면 별도 endpoint를 만들 수도 있음
 */
app.get("/health", (req, res) => {
  res.json({ ok: true, message: "server is running" });
});

/**
 * API 라우터 연결:
 * - /api 로 시작하는 모든 요청은 dashboardRoutes로 넘어감
 */
// /api 는 전부 관리자(ADMIN) 로그인 토큰 필요
app.use("/api", sec.authenticate({}), sec.requireRole("ADMIN"), dashboardRoutes);

// 에러 핸들러: 내부 메시지·스택 트레이스 숨김
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ message: "잘못된 JSON 형식입니다" });
  console.error("unhandled error:", err);
  res.status(500).json({ message: "internal error" });
});

const PORT = Number(process.env.PORT || 4000);

/**
 * listen:
 * - 서버 실행 확인 로그가 반드시 뜨게 해둔다
 */
app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);
});
