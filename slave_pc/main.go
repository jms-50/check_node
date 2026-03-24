package main

import (
	"context"
	"fmt"
	"log"
	"time"
	"unsafe"

	"check_node/pb"

	"golang.org/x/sys/windows"
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
	oldProcessMap, err := getProcessMap()

	go getStreamRecv()

	// 3. 실시간 감시 고루틴 실행
	for {
		// 1초 대기 (CPU 점유율을 낮추기 위한 딜레이)
		time.Sleep(time.Second / 10)

		// 현재 프로세스 목록 가져오기
		currentProcessMap, err := getProcessMap()
		if err != nil {
			log.Printf("프로세스 목록 업데이트 실패: %v\n", err)
			continue
		}

		// 1. 새로운 프로세스 생성 감지 (현재에는 있는데 이전에는 없는 경우)
		for pid, name := range currentProcessMap {
			if _, exists := oldProcessMap[pid]; !exists {
				fmt.Printf("[+] 프로세스 생성 감지 -> PID: %-5d | Name: %s\n", pid, name)
				// TODO: 여기서 gRPC 클라이언트를 호출하여 서버로 데이터 전송
			}
		}

		// 2. 프로세스 종료 감지 (이전에는 있는데 현재에는 없는 경우)
		for pid, name := range oldProcessMap {
			if _, exists := currentProcessMap[pid]; !exists {
				fmt.Printf("[-] 프로세스 종료 감지 -> PID: %-5d | Name: %s\n", pid, name)
				// TODO: 여기서 gRPC 클라이언트를 호출하여 서버로 데이터 전송
			}
		}

		// 다음 비교를 위해 현재 상태를 이전 상태로 업데이트
		oldProcessMap = currentProcessMap
	}

}

// event 감지 및 동작
func getProcessMap() (map[uint32]string, error) {
	// 1. 프로세스 스냅샷 생성
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, fmt.Errorf("스냅샷 생성 실패: %v", err)
	}
	// 중요: 메모리 누수 방지를 위해 핸들 닫기
	defer windows.CloseHandle(snapshot)

	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry)) // C 구조체 크기 지정 (필수)

	processMap := make(map[uint32]string)

	// 2. 첫 번째 프로세스 정보 가져오기
	err = windows.Process32First(snapshot, &entry)
	if err != nil {
		return nil, fmt.Errorf("첫 번째 프로세스 읽기 실패: %v", err)
	}

	// 3. 루프를 돌며 모든 프로세스 정보 수집
	for {
		// UTF-16 배열을 Go 문자열(UTF-8)로 변환
		exeName := windows.UTF16ToString(entry.ExeFile[:])
		processMap[entry.ProcessID] = exeName

		// 다음 프로세스로 이동
		err = windows.Process32Next(snapshot, &entry)
		if err != nil {
			// 더 이상 읽을 프로세스가 없으면 에러(ERROR_NO_MORE_FILES)를 반환하므로 루프 종료
			break
		}
	}

	return processMap, nil

}

func getStreamRecv() {
	stream, _ := grpcClient.SubscribePolicy(context.Background(), &pb.SlaveID{Id: slaveID})
	for {
		policy, err := stream.Recv()
		if err != nil {
			log.Printf("❌ 스트림 수신 실패: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		// 마스터로부터 받은 블랙리스트 업데이트
		currentBlockedProcesses = policy.BlockedProcesses
		log.Printf("🚫 업데이트된 차단 목록: %v", currentBlockedProcesses)
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
