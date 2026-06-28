# Master PC

NestJS 기반 master 서버다. 관리자용 HTTP API와 slave 통신용 gRPC 서버를 함께 실행한다.

## 역할

- 차단 정책 조회 및 갱신
- slave 등록
- slave별 정책 stream 관리
- 차단 이벤트 수신

## 실행

```bash
npm install
npm run start:dev
```

- HTTP API: `http://localhost:3000`
- gRPC: `0.0.0.0:50051`

## 보안 설정

개발 편의를 위해 `ADMIN_API_KEY`가 없으면 기존처럼 관리자 API를 열어 둔다. 운영 또는 공유 네트워크에서는 반드시 설정한다.

```bash
ADMIN_API_KEY=change-me GRPC_SHARED_TOKEN=slave-token npm run start:prod
```

설정된 경우 `/admin/*` HTTP API는 `X-Admin-API-Key` 헤더가 맞아야 접근할 수 있다. 대시보드는 같은 값을 `VITE_ADMIN_API_KEY`로 설정한다.

```bash
VITE_ADMIN_API_KEY=change-me npm run dev
```

`GRPC_SHARED_TOKEN`이 설정된 경우 slave도 같은 값을 환경변수로 가져야 한다.

```bash
GRPC_SHARED_TOKEN=slave-token cargo run
```

관리자 대시보드 origin은 기본적으로 `localhost`/`127.0.0.1`의 Vite dev/preview 포트만 허용한다. 다른 origin을 써야 하면 쉼표로 지정한다.

```bash
ADMIN_CORS_ORIGINS=http://localhost:5173,http://admin.example.local
```

운영에서는 TypeORM `synchronize`가 자동으로 꺼진다. 개발 환경에서도 끄려면 `TYPEORM_SYNCHRONIZE=false`를 설정한다.

## 주요 API

- `GET /admin/policy`: 현재 정책 조회
- `POST /admin/policy`: 정책 갱신 및 slave 전파

정책 예시:

```json
{
  "blocked_urls": ["example.com"],
  "blocked_processes": ["notepad.exe"]
}
```

## 테스트

```bash
npm run build
npm test
npm run test:e2e
```

## gRPC 계약

Master는 루트의 `pb/service.proto`를 사용한다. Rust slave도 같은 proto 파일을 빌드하므로 RPC나 message를 바꿀 때는 양쪽을 함께 확인해야 한다.
