import { useEffect, useState } from "react";

const API = "http://localhost:4000";

export default function App() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 열린 위반 목록 불러오기
  async function loadOpen() {
    const res = await fetch(`${API}/violations/open`);
    if (!res.ok) throw new Error("위반 목록 조회 실패");
    const data = await res.json();
    setItems(data);
  }

  // 위반 상세 불러오기
  async function loadDetail(id) {
    setLoading(true);
    setSelectedId(id);
    const res = await fetch(`${API}/violations/${id}`);
    if (!res.ok) throw new Error("위반 상세 조회 실패");
    const data = await res.json();
    setDetail(data);
    setLoading(false);
  }

  // 위반 해결 처리
  async function resolve(id) {
    const res = await fetch(`${API}/violations/${id}/resolve`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("해결 처리 실패");

    setDetail(null);
    setSelectedId(null);
    await loadOpen();
  }

  // 🔥 자동 갱신 (3초마다)
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        await loadOpen();
      } catch (e) {
        if (alive) setErr(e.message);
      }
    };

    tick(); // 최초 1회
    const timer = setInterval(tick, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: 16,
        fontFamily: "sans-serif",
      }}
    >
      {/* 왼쪽: 위반 목록 */}
      <div style={{ width: 420 }}>
        <h2>🚨 열린 위반 목록</h2>
        <button onClick={loadOpen}>수동 새로고침</button>

        {err && (
          <div style={{ color: "crimson", marginTop: 8 }}>
            에러: {err}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {items.map((v) => (
            <div
              key={v.id}
              onClick={() => loadDetail(v.id)}
              style={{
                border: "1px solid #ddd",
                padding: 12,
                borderRadius: 8,
                cursor: "pointer",
                background: v.id === selectedId ? "#f3f3f3" : "white",
              }}
            >
              <div>
                <b>#{v.id}</b> {v.violation_type}
              </div>
              <div>차량 번호: {v.plate_text}</div>
              <div>주차칸: {v.spot_id}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {new Date(v.created_at).toLocaleString()}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <div style={{ opacity: 0.7 }}>열린 위반이 없습니다.</div>
          )}
        </div>
      </div>

      {/* 오른쪽: 상세 */}
      <div style={{ flex: 1 }}>
        <h2>📌 위반 상세</h2>

        {!selectedId && (
          <div style={{ opacity: 0.7 }}>
            왼쪽에서 위반 항목을 선택하세요.
          </div>
        )}

        {loading && <div>불러오는 중...</div>}

        {detail && (
          <div
            style={{
              border: "1px solid #ddd",
              padding: 16,
              borderRadius: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ margin: 0 }}>
                위반 #{detail.violation.id}
              </h3>
              <button onClick={() => resolve(detail.violation.id)}>
                ✅ 해결 처리
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div>
                <b>차량 번호</b>: {detail.violation.plate_text}
              </div>
              <div>
                <b>주차칸</b>: {detail.violation.spot_id}
              </div>
              <div>
                <b>유형</b>: {detail.violation.violation_type}
              </div>
              <div>
                <b>상태</b>: {detail.violation.status}
              </div>
              <div>
                <b>발생 시각</b>:{" "}
                {new Date(detail.violation.created_at).toLocaleString()}
              </div>
              {detail.violation.last_event_id && (
                <div>
                  <b>최근 이벤트</b>:{" "}
                  <code>{detail.violation.last_event_id}</code>
                </div>
              )}
            </div>

            <h4 style={{ marginTop: 16 }}>📷 증거 이벤트</h4>
            <ul>
              {detail.evidences.map((e) => (
                <li key={e.id}>
                  <code>{e.event_id}</code> /{" "}
                  {new Date(e.created_at).toLocaleString()}
                </li>
              ))}
              {detail.evidences.length === 0 && <li>증거 없음</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

