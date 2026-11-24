# PCS — Parking Control System (Dashboard)

AI 카메라 기반 **아파트 스마트 주차 관리 시스템**의 웹 대시보드입니다.
카메라가 주차칸 점유와 불법주차를 자동으로 감지하고, 관리자와 입주민은 이 대시보드에서 실시간으로 확인합니다.

> 이 폴더는 **프론트엔드**입니다. 백엔드·AI 서버·DB·인프라는 같은 상위 폴더의 [`../smart-parking`](../smart-parking)에 있습니다.

## 주요 기능

**관리자** (`/admin/*`, 데스크톱, 다크 테마)
- 대시보드: 주차 점유율, 미처리 위반, 시스템 상태 표시. 불법주차(금지구역·이중주차)는 3초 주기로 감지해 배너로 경고
- CCTV: AI 카메라 MJPEG 스트림과 구역 오버레이(점유=빨강, 비어있음=초록), 그 밖의 카메라는 HLS로 재생
- 위반 관리: SSE로 실시간 수신(실패 시 30초 폴링), 처리 완료
- 주차 제어: 색깔 기반 입차/출차. AI가 칸을 확정하면 출차 버튼 표시
- 회원 관리, 방문자 출입증 승인/거절

**입주민** (`/resident/*`, 모바일, 하단 탭)
- 홈: 실시간 빈자리 + **선호 주차칸 TOP 3와 지금 비어있는지** + 입출차 알림 배너(소리·진동)
- 내 차량 / 주차 위치: 현재 주차 칸, 입차 시각, 경과 시간
- 주차 이력: 총 이용 횟수, 평균 시간, 가장 많이 쓴 칸, 날짜별 이력
- 방문자 등록과 승인 상태 확인

## 기술 스택

React 18 · TypeScript · Vite 6 · Tailwind CSS · React Router 6 · hls.js · Lumi SDK(인증)

## 실행

```bash
pnpm install
cp .env.example .env     # 백엔드/스트림 주소 설정
pnpm dev                 # http://localhost:5173
pnpm dev --host          # 같은 네트워크의 다른 기기(iPad 등)에서 접속할 때
pnpm lint
pnpm build
```

| 환경 변수 | 설명 | 예시 |
|---|---|---|
| `VITE_BACKEND_URL` | 백엔드 REST API 주소 | `http://localhost:4000` |
| `VITE_HLS_BASE_URL` | MediaMTX HLS 주소 | `http://localhost:8889` |
| `VITE_MJPEG_BASE_URL` | AI 카메라 MJPEG 주소 | `http://localhost:8090` |
| `VITE_USE_DENO_PROXY` | `true`이면 Lumi Deno 함수(`functions/backend-proxy`)를 거쳐 호출 | `false` |

전체 시스템(백엔드·DB·AI)까지 함께 실행하는 방법은 [`../smart-parking/README.md`](../smart-parking/README.md)에 있습니다.
이 폴더와 `smart-parking`이 같은 상위 폴더에 나란히 있으면, VSCode로 이 폴더를 열 때 `.vscode/tasks.json`이 전체 서비스(Docker → 백엔드 → consumer → AI → 프론트)를 자동으로 시작합니다.

```
상위 폴더/
├── Resident and Admin Dashboard/   ← 이 폴더 (VSCode로 열기)
└── smart-parking/
```

> **로그인**: Lumi 인증을 씁니다. 관리자 화면은 `ADMIN`, 입주민 화면은 `USER` 역할 계정으로 로그인해야 하고,
> 역할은 Lumi 프로젝트 소유자가 부여합니다. 다른 Lumi 프로젝트로 쓰려면 `src/lib/lumi.ts`의 `projectId`를 바꾸세요 (백엔드 `LUMI_PROJECT_ID`도 같이).
> 로그인 토큰은 `src/lib/api.ts`가 모든 백엔드 요청에 자동으로 붙이고, 백엔드가 이 토큰으로 권한을 확인합니다.

## 문서

- [코드 구조 (ARCHITECTURE.md)](docs/ARCHITECTURE.md): 폴더 구조, 데이터 흐름, 화면별 폴링 구조
- [작품요약서](docs/작품요약서.md)
