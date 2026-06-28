# AGENTS.md

이 문서는 이 저장소에서 작업하는 개발자와 코딩 에이전트가 같은 기준으로 움직이기 위한 프로젝트 가이드다.

## 프로젝트 개요

`check_node`는 master PC가 여러 slave PC에 차단 정책을 배포하고, slave PC가 Windows 환경에서 특정 URL 또는 프로세스 접근을 제어하는 것을 목표로 한다.

현재 구현의 중심은 다음 두 축이다.

- `master_pc`: NestJS 기반 master 서버
- `slave_pc`: Rust 기반 Windows slave 에이전트

Go 기반 slave 구현과 Go용 protobuf 생성 코드는 제거됐다. 새 기능 개발은 Rust 기준으로 진행한다.

## 주요 디렉토리

- `master_pc/`
  - NestJS 애플리케이션이다.
  - HTTP 관리자 API와 gRPC master 서버 역할을 동시에 맡는다.
  - 핵심 파일:
    - `src/main.ts`: HTTP 서버와 gRPC microservice 부트스트랩
    - `src/app.controller.ts`: 정책 API, slave 등록, 정책 스트림, heartbeat, 이벤트 보고 처리
    - `src/app.module.ts`: Nest module 구성
    - `src/app.service.ts`: Nest starter 잔여 서비스이며 현재 핵심 로직에는 거의 쓰이지 않는다.

- `slave_pc/`
  - Rust 기반 slave 에이전트다.
  - Windows API로 프로세스를 감시하고, master에서 받은 정책에 따라 차단한다.
  - 핵심 파일:
    - `src/main.rs`: gRPC 연결, 정책 구독, 프로세스 감시, 프로세스 종료, 이벤트 보고
    - `build.rs`: protobuf에서 Rust gRPC 코드를 생성
    - `Cargo.toml`: Rust 의존성 관리
    - `.cargo/config.toml`: Windows GNU 타깃용 linker 설정

- `pb/`
  - protobuf 계약 파일이 위치한다.
  - `service.proto`가 master와 Rust slave의 단일 gRPC 계약이다.
  - 생성 코드는 직접 수정하지 말고 proto에서 재생성한다.

## 현재 실행 흐름

1. Master가 NestJS 앱을 시작한다.
   - HTTP 서버: `localhost:3000`
   - gRPC 서버: `0.0.0.0:50051`

2. Slave가 gRPC로 master에 연결한다.
   - 현재 Rust 코드는 `http://localhost:50051`로 하드코딩되어 있다. (환경변수 또는 `.env` 설정으로 변경 가능)
   - `Register` RPC로 slave ID를 발급받는다.

3. Slave가 `SubscribePolicy` 스트림을 구독한다.
   - Master는 slave별 stream subject를 메모리에 저장한다.
   - 정책이 업데이트되면 연결된 slave들에게 push한다.

4. 관리자가 HTTP API로 정책을 변경한다.
   - `GET /admin/policy`: 현재 정책 조회
   - `POST /admin/policy`: `blocked_urls`, `blocked_processes` 갱신 및 slave 전파

5. Slave가 Windows 프로세스를 감시한다.
   - **기본 감시 방식**: Windows 환경에서는 WMI 이벤트(`Win32_ProcessStartTrace`/`Win32_ProcessStopTrace`) 기반 실시간 감시를 수행하며, 백그라운드 스레드에서 대기함으로써 CPU 부하를 거의 제로화합니다.
   - **비-Windows 개발 환경**: 100ms 폴링 방식으로 모의 스캔을 수행합니다.
   - **초기 베이스라인 동기화**: 에이전트 구동 시작 시점에 1회 스냅샷을 검사하여 이미 실행 중인 프로세스를 즉시 강제 종료하고 리포트합니다.
   - 차단 이벤트는 `ReportEvent` RPC로 master에 보고합니다.

## 개발 명령어

### Master

```bash
cd master_pc
npm install
npm run start:dev
```

빌드:

```bash
cd master_pc
npm run build
```

테스트:

```bash
cd master_pc
npm test
npm run test:e2e
```

테스트는 현재 `/admin/policy` API 기준으로 맞춰져 있다.

### Slave

```bash
cd slave_pc
cargo run
```

테스트:

```bash
cd slave_pc
cargo test
```

현재 Rust 테스트는 1개(`config.rs` 설정 테스트)다.

## 중요한 현재 상태

### 1. Protobuf 계약

Master와 Rust slave는 모두 `pb/service.proto`를 사용한다.

- package: `checknode`
- NestJS proto path: `master_pc/src/main.ts`
- Rust build input: `slave_pc/build.rs`

RPC나 message를 바꿀 때는 master와 slave를 함께 갱신한다.

### 2. Master gRPC 의존성

`master_pc/package.json`에는 gRPC 실행에 필요한 런타임 의존성이 명시되어 있다.

- `@nestjs/microservices`
- `@grpc/grpc-js`
- `@grpc/proto-loader`

### 3. 레거시 제거 완료

이전 slave 구현과 관련 생성 코드는 Rust 구현으로 대체됐다. 해당 구현을 되살리거나 새 로직을 추가하지 않는다.

### 4. 빌드 산출물 관리

`slave_pc/target/`는 Rust 빌드 산출물이며 저장소에 포함하면 안 된다. 루트 `.gitignore`에서 제외하고 있다.

`master_pc/dist/`와 `master_pc/node_modules/`도 빌드 및 설치 산출물이므로 커밋하지 않는다.

## 개발 우선순위

새 개발을 시작할 때 권장 순서는 다음과 같다.

1. `pb/service.proto` 기준으로 master/slave 계약 변경 여부 결정
2. master 테스트를 현재 API 기준으로 유지
3. Rust slave를 모듈 단위로 유지 관리
4. Windows 환경에서 실제 프로세스 차단 시나리오 검증
5. URL 차단 기능 설계 및 슬레이브 자동 재연결 메커니즘 구현

## 코드 작업 원칙

- Master와 slave 사이의 계약은 proto를 기준으로 생각한다.
- gRPC message나 RPC를 바꿀 때는 master와 slave를 함께 갱신한다.
- 생성된 코드는 수동 수정하지 않는다.
- Go 구현을 재도입하지 않는다.
- Windows 전용 동작은 가능한 한 작게 격리해 테스트 가능한 순수 로직과 분리한다.
- **정책의 휘발성 및 연결성**: Master의 정책 상태는 순수 메모리 기반(휘발성)입니다. Master 서버가 재시작되면 제한하고자 선언한 정책들은 모두 기억되지 않고 리셋됩니다.
- **클라이언트 세션 복구**: Master가 재기동되더라도, 기존 실행 중이던 Slave 클라이언트들이 주기적으로 자동 재연결을 시도해 마스터와의 연결 세션은 자동으로 유지 및 복구되도록 구현합니다.
- `AppController`에 HTTP와 gRPC 로직이 함께 있으므로, 기능이 커지면 controller/service를 분리한다.

## 검증 체크리스트

변경 후 가능한 범위에서 다음을 확인한다.

```bash
cd master_pc
npm run build
npm test
```

```bash
cd slave_pc
cargo test
```

gRPC 계약을 바꾼 경우에는 master 실행 후 slave 연결까지 확인한다.

```bash
cd master_pc
npm run start:dev
```

다른 터미널에서:

```bash
cd slave_pc
cargo run
```

실제 프로세스 차단 기능은 Windows에서 검증한다.
