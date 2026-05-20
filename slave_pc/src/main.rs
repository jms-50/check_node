use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;

pub mod pb;
pub mod config;
pub mod policy;
pub mod reporter;
pub mod process_monitor;

use pb::check_node_client::CheckNodeClient;
use pb::SlaveInfo;
use config::Config;
use process_monitor::ProcessMonitor;
use policy::get_stream_recv;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. 설정 불러오기
    let config = Config::load();

    // 2. gRPC 연결 설정
    let channel = tonic::transport::Endpoint::from_shared(config.server_url)?
        .connect()
        .await
        .unwrap_or_else(|e| panic!("❌ 연결 실패: {}", e));

    let mut grpc_client = CheckNodeClient::new(channel);

    // 3. 슬레이브 등록
    let reg_req = tonic::Request::new(SlaveInfo {
        hostname: config.hostname,
        ip_address: String::new(),
        os_version: std::env::consts::OS.to_string(),
    });

    let reg_res = grpc_client
        .register(reg_req)
        .await
        .unwrap_or_else(|e| panic!("❌ 슬레이브 등록 실패: {}", e))
        .into_inner();

    let slave_id = reg_res.slave_id;
    println!("✅ 슬레이브 등록 완료. ID: {}", slave_id);

    // 공유 상태 변수
    let blocked_processes = Arc::new(RwLock::new(Vec::<String>::new()));

    // 4. 마스터로부터 정책을 수신하는 백그라운드 태스크(Task)
    let client_clone = grpc_client.clone();
    let slave_id_clone = slave_id.clone();
    let blocked_clone = Arc::clone(&blocked_processes);

    tokio::spawn(async move {
        get_stream_recv(client_clone, slave_id_clone, blocked_clone).await;
    });

    // 5. 모니터 객체 초기화 및 베이스라인 스냅샷 생성
    let mut monitor = ProcessMonitor::new(blocked_processes, slave_id.clone(), grpc_client.clone());
    let _ = monitor.update_and_detect().await;
    println!("🔍 초기 프로세스 맵핑 완료. 100ms 주기로 실시간 감시를 시작합니다...");

    // 6. 실시간 감시 루프
    loop {
        // 100ms 대기 적용 (CPU 부하 최소화)
        sleep(Duration::from_millis(100)).await;

        // 스냅샷을 찍고 변경점을 즉시 탐지
        if let Err(e) = monitor.update_and_detect().await {
            eprintln!("⚠️ 프로세스 목록 업데이트 실패: {}", e);
        }
    }
}
