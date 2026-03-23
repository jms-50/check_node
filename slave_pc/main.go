package main

import (
	"context"
	"log"
	"strings"
	"time"

	"check_node/pb"

	"github.com/shirou/gopsutil/v3/process" // 프로세스 감시용
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// 전역 변수로 현재 차단 목록 관리
var currentBlockedProcesses []string
var slaveID string
var grpcClient pb.CheckNodeClient

func main() {
	// 1. gRPC 연결 설정 (이전과 동일)
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("❌ 연결 실패: %v", err)
	}
	defer conn.Close()
	grpcClient = pb.NewCheckNodeClient(conn)

	// 2. 슬레이브 등록 (이전과 동일)
	reg, _ := grpcClient.Register(context.Background(), &pb.SlaveInfo{
		Hostname: "Windows-Agent-01",
	})
	slaveID = reg.SlaveId

	// 3. 실시간 감시 고루틴 실행
	go startMonitoring()

	// 4. 정책 수신 스트림
	stream, _ := grpcClient.SubscribePolicy(context.Background(), &pb.SlaveID{Id: slaveID})
	for {
		policy, err := stream.Recv()
		if err != nil {
			break
		}
		// 마스터로부터 받은 블랙리스트 업데이트
		currentBlockedProcesses = policy.BlockedProcesses
		log.Printf("🚫 업데이트된 차단 목록: %v", currentBlockedProcesses)
	}
}

// 핵심 기능: 1초마다 프로세스를 스캔하고 처단함
func startMonitoring() {
	log.Println("👀 프로세스 감시 엔진 가동 중...")
	for {
		if len(currentBlockedProcesses) == 0 {
			time.Sleep(1 * time.Second)
			continue
		}

		// 현재 실행 중인 모든 프로세스 가져오기
		processes, _ := process.Processes()
		for _, p := range processes {
			name, _ := p.Name()

			// 블랙리스트에 포함된 프로세스인지 확인
			for _, blocked := range currentBlockedProcesses {
				if strings.EqualFold(name, blocked) { // 대소문자 구분 없이 비교
					log.Printf("⚠️ 위반 발견! 종료 시도: %s (PID: %d)", name, p.Pid)

					// 프로세스 즉시 사살
					err := p.Kill()
					if err == nil {
						// 마스터에게 차단 성공 보고
						reportViolation(name)
					}
				}
			}
		}
		time.Sleep(1 * time.Second) // 스캔 간격
	}
}

func reportViolation(target string) {
	_, err := grpcClient.ReportEvent(context.Background(), &pb.EventLog{
		SlaveId:   slaveID,
		Target:    target,
		Type:      "PROCESS",
		Timestamp: time.Now().Unix(),
	})
	if err != nil {
		log.Printf("❌ 보고 실패: %v", err)
	}
}
