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
