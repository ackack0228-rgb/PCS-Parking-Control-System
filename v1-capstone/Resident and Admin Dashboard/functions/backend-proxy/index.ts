/**
 * Deno Function: Backend Proxy
 * --------------------------------------------------------
 * Node.js Express 백엔드 API를 프록시하는 Deno Function
 * 
 * 기능:
 * - /api/* 요청을 백엔드 서버로 전달
 * - MySQL 직접 연결 (백엔드 서버가 없을 때)
 * - CORS 헤더 자동 추가
 */

interface RequestPayload {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  console.log(JSON.stringify({ 
    stage: "start", 
    url: req.url, 
    method: req.method 
  }));

  // CORS 헤더 (ASCII-only)
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // OPTIONS 요청 처리
  if (req.method === "OPTIONS") {
    console.log(JSON.stringify({ stage: "response", status: 204 }));
    return new Response(null, { status: 204, headers });
  }

  try {
    const { method, path, body } = await req.json() as RequestPayload;

    console.log(JSON.stringify({ 
      stage: "config", 
      proxyRequest: { method, path } 
    }));

    // 백엔드 서버 URL (환경 변수로 설정)
    const backendUrl = Deno.env.get("BACKEND_URL") || "http://localhost:4000";
    const base = new URL(backendUrl);

    // SSRF 방지: 경로는 "/"로 시작하는 상대 경로만, 최종 주소가 백엔드와 같은 출처여야 한다
    // (예: "@evil.com/x", "//evil.com" 같은 값은 거부)
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
      return new Response(JSON.stringify({ message: "invalid path" }), { status: 400, headers });
    }
    const target = new URL(path, base);
    if (target.origin !== base.origin) {
      return new Response(JSON.stringify({ message: "invalid path" }), { status: 400, headers });
    }
    if (!["GET", "POST"].includes(method)) {
      return new Response(JSON.stringify({ message: "method not allowed" }), { status: 405, headers });
    }
    const fullUrl = target.toString();

    console.log(JSON.stringify({ 
      stage: "external_request", 
      url: fullUrl, 
      method 
    }));

    // 백엔드로 요청 전달
    const response = await fetch(fullUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        // 사용자의 Lumi 토큰을 그대로 전달 → 백엔드가 인증·권한 확인
        ...(req.headers.get("Authorization") ? { Authorization: req.headers.get("Authorization")! } : {}),
      },
      body: body && method !== "GET" ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    console.log(JSON.stringify({ 
      stage: "external_response", 
      status: response.status 
    }));

    console.log(JSON.stringify({ 
      stage: "response", 
      status: response.status 
    }));

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers,
    });
  } catch (error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error))
    console.error(JSON.stringify({
      stage: "error",
      type: e.constructor.name,
      message: e.message
    }));
    
    return new Response(
      JSON.stringify({
        ok: false,
        message: "Backend connection failed",
        // 내부 에러 메시지는 로그에만 (응답에는 넣지 않는다)
      }),
      {
        status: 500,
        headers,
      }
    );
  }
});
