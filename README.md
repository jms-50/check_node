# CHECK NODE

client watch program, master pc가 slave pc들에 대하여 특정 URL, 프로그램에 접근하는 것을 차단시키는 프로그램이다.

master pc와 slave pc는 전부 window여야 한다.

---

## 수행하는 역할
1. 웹사이트 접근 제어
2. 프로그램 실행 제어

---

## TOOLS
- master: Node.js / NestJS
- slave: Rust
- master to slave and slave to master protocol: gRPC
- shared protocol contract: `pb/service.proto`

---

## Directory Structure
- `/pb`: master와 slave가 공유하는 protobuf/gRPC 계약
- `/master_pc`: Node.js based master pc code (NestJS)
- `/slave_pc`: Rust based slave pc code

---

## 실행 방법

### Master PC

```bash
cd master_pc
npm install
npm run start:dev
```

- HTTP 관리자 API: `http://localhost:3000`
- gRPC slave 통신 포트: `0.0.0.0:50051`

### Slave PC

```bash
cd slave_pc
cargo run
```

현재 slave는 Windows API로 프로세스를 감시하므로 실제 기능 검증은 Windows에서 진행해야 한다.

---

## 테스트 방법

### Master PC

```bash
cd master_pc
npm run build
npm test
npm run test:e2e
```

### Slave PC

```bash
cd slave_pc
cargo test
```

---

## 현재 구현 흐름

1. master가 HTTP 서버와 gRPC 서버를 함께 실행한다.
2. slave가 master의 gRPC 서버에 연결하고 `Register` RPC로 slave id를 발급받는다.
3. slave가 `SubscribePolicy` RPC stream을 구독한다.
4. 관리자가 `POST /admin/policy`로 차단 정책을 갱신하면 master가 연결된 slave들에게 정책을 push한다.
5. slave는 100ms 주기로 Windows 프로세스 스냅샷을 확인한다.
6. 실행 중인 프로세스가 `blocked_processes`와 일치하면 종료하고 `ReportEvent` RPC로 master에 보고한다.

---

## 프로그램 다이어그램
'''
MASTER: Node.js
SLAVE: Rust
                +-------------------+
                |                   |
                |     MASTER PC     |
                |                   |
                +-------------------+
                          ▲
                          |
        +--------------[ gRPC ]-------------+
        |                 |                 |       
        ▼                 ▼                 ▼   
 +------------+    +------------+     +------------+    
 |  SLAVE PC  |    |  SLAVE PC  |     |  SLAVE PC  |   
 +------------+    +------------+     +------------+

'''

---

## TASK
- url 제어
- 프로세스 제어
- 실행 전 제어 입력 처리
- 실행도중 제어 입력 처리
- master pc 관리자 대시보드
- DB 구축
- WMI 이용하는 방향으로 변경하여 polling -> event 방식으로 변경
