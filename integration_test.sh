#!/bin/bash
set -e

# 프로젝트 루트 디렉토리 설정
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "============================================="
echo "  check_node End-to-End Integration Test"
echo "============================================="

# 포트 정리 함수
kill_port() {
  local port=$1
  local pids=$(lsof -t -i :$port)
  if [ -n "$pids" ]; then
    echo "Killing processes on port $port: $pids"
    kill -9 $pids 2>/dev/null || true
  fi
}

# 1. 백그라운드 프로세스 청소 정의
cleanup() {
  echo ""
  echo "🧹 Cleaning up background processes..."
  if [ -n "$SLAVE_PID" ]; then
    echo "Stopping Slave Agent (PID: $SLAVE_PID)"
    kill -9 $SLAVE_PID 2>/dev/null || true
  fi
  if [ -n "$MASTER_PID" ]; then
    echo "Stopping Master Server (PID: $MASTER_PID)"
    kill -9 $MASTER_PID 2>/dev/null || true
  fi
  if [ -n "$APP_PID" ]; then
    echo "Stopping Test Application (PID: $APP_PID)"
    kill -9 $APP_PID 2>/dev/null || true
  fi
  
  # 포트 정리로 혹시 모를 잔여 프로세스 보장
  kill_port 50051
  kill_port 3000
  echo "✨ Cleanup complete."
}
trap cleanup EXIT

# 사전 포트 클리어
echo "Cleaning existing ports..."
kill_port 50051
kill_port 3000

# 2. 마스터 서버 의존성 확인 및 실행
echo "📦 1. Starting Master Server..."
cd "$ROOT_DIR/master_pc"
if [ ! -d "node_modules" ]; then
  echo "Installing master_pc dependencies..."
  npm install
fi

# 마스터 서버 백그라운드 기동
npm run start:dev > master.log 2>&1 &
MASTER_PID=$!
echo "Master Server started with PID: $MASTER_PID (Logs: master_pc/master.log)"

# HTTP 및 gRPC 포트 대기
echo "Waiting for Master Server to boot..."
for i in {1..15}; do
  if curl -s http://localhost:3000/admin/policy > /dev/null; then
    echo "✅ Master HTTP port (3000) is ready!"
    break
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "❌ Timeout waiting for Master Server to start. Check master_pc/master.log"
    cat master.log
    exit 1
  fi
done

# 3. 슬레이브 에이전트 빌드 및 실행
echo ""
echo "⚙️ 2. Building and Starting Slave Agent..."
cd "$ROOT_DIR/slave_pc"

# gRPC 연결을 위한 기본 .env 설정 확인 또는 생성
if [ ! -f ".env" ]; then
  echo "Creating default .env configuration..."
  echo "SERVER_URL=http://localhost:50051" > .env
  echo "HOSTNAME=macOS-Test-Agent" >> .env
fi

# 슬레이브 빌드 및 테스트 앱 빌드
cargo build
cargo build --bin my_test_app

# 슬레이브 실행
./target/debug/slave_pc > slave.log 2>&1 &
SLAVE_PID=$!
echo "Slave Agent started with PID: $SLAVE_PID (Logs: slave_pc/slave.log)"

# 슬레이브 등록 대기
sleep 2

# 4. 정책 업데이트 (my_test_app 차단 등록)
echo ""
echo "🚨 3. Deploying block policy for 'my_test_app'..."
POLICY_UPDATE_RES=$(curl -s -X POST -H "Content-Type: application/json" \
  -d '{"blocked_processes":["my_test_app"]}' \
  http://localhost:3000/admin/policy)

echo "Policy Response: $POLICY_UPDATE_RES"

# 정책이 슬레이브에 적용될 수 있게 잠시 대기
sleep 2

# 5. 모의 타겟 프로세스 실행 (정책 적용 후에 실행해야 감지 시 차단됨)
echo ""
echo "🚀 4. Launching Test Application (Should be blocked instantly)..."
./target/debug/my_test_app &
APP_PID=$!
echo "Test App 'my_test_app' launched with PID: $APP_PID"

# 6. 감지 및 차단 검증
echo ""
echo "🔍 5. Checking if 'my_test_app' is terminated by Slave..."
TERMINATED=false
for i in {1..10}; do
  if ! ps -p $APP_PID > /dev/null; then
    echo "✅ Success! 'my_test_app' (PID: $APP_PID) was successfully terminated."
    TERMINATED=true
    break
  fi
  sleep 0.5
done

if [ "$TERMINATED" = false ]; then
  echo "❌ Failure! 'my_test_app' (PID: $APP_PID) is still running."
  echo "--- Slave Logs ---"
  cat slave.log
  echo "--- Master Logs ---"
  cat ../master_pc/master.log
  exit 1
fi

# 7. 마스터 보고 확인 (서버 로그에 VIOLATION 이벤트 전송 기록 확인)
echo ""
echo "📡 6. Verifying Violation Event Report at Master..."
sleep 2 # gRPC 전송 및 로깅 딜레이 보장

if grep -q "VIOLATION" ../master_pc/master.log; then
  echo "✅ Success! Violation event was reported and logged by Master Server."
else
  echo "❌ Failure! 'VIOLATION' pattern not found in master logs. Dumping master.log:"
  cat ../master_pc/master.log
  echo "--- Slave Logs ---"
  cat slave.log
  exit 1
fi

echo ""
echo "🎉 Integration Test PASSED successfully!"
echo "============================================="
