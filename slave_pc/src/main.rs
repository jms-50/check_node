use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;

pub mod pb;
pub mod config;
pub mod policy;
pub mod reporter;
pub mod process_monitor;
pub mod url_blocker;
pub mod heartbeat;
pub mod grpc_auth;

use pb::check_node_client::CheckNodeClient;
use pb::SlaveInfo;
use config::Config;
use process_monitor::ProcessMonitor;
use policy::get_stream_recv;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. 설정 불러오기
    let config = Config::load();

    // 2. gRPC 연결 설정 (connect_lazy 활용하여 지연 연결 및 자동 재연결)
    let channel = tonic::transport::Endpoint::from_shared(config.server_url.clone())?
        .connect_lazy();

    let mut grpc_client = CheckNodeClient::new(channel);

    // 3. 슬레이브 등록 (성공할 때까지 재시도)
    let slave_id = loop {
        let mut reg_req = tonic::Request::new(SlaveInfo {
            hostname: config.hostname.clone(),
            ip_address: String::new(),
            os_version: std::env::consts::OS.to_string(),
        });
        grpc_auth::attach_shared_token(&mut reg_req, config.grpc_shared_token.as_deref())?;

        match grpc_client.register(reg_req).await {
            Ok(res) => {
                let id = res.into_inner().slave_id;
                println!("✅ 슬레이브 등록 완료. ID: {}", id);
                break id;
            }
            Err(e) => {
                eprintln!("⚠️ 마스터 서버 연결/등록 실패. 5초 후 재시도...: {}", e);
                sleep(Duration::from_secs(5)).await;
            }
        }
    };

    // 3-1. Heartbeat 백그라운드 태스크 기동
    let heartbeat_client = grpc_client.clone();
    let heartbeat_slave_id = slave_id.clone();
    let heartbeat_token = config.grpc_shared_token.clone();
    tokio::spawn(async move {
        heartbeat::start_heartbeat_loop(heartbeat_client, heartbeat_slave_id, heartbeat_token).await;
    });

    // 공유 상태 변수
    let blocked_processes = Arc::new(RwLock::new(Vec::<String>::new()));

    // 4. 마스터로부터 정책을 수신하는 백그라운드 태스크(Task)
    let client_clone = grpc_client.clone();
    let slave_id_clone = slave_id.clone();
    let blocked_clone = Arc::clone(&blocked_processes);
    let policy_token = config.grpc_shared_token.clone();

    tokio::spawn(async move {
        get_stream_recv(client_clone, slave_id_clone, blocked_clone, policy_token).await;
    });

    // 5. 모니터 객체 초기화 및 베이스라인 스냅샷 생성
    let mut monitor = ProcessMonitor::new(
        blocked_processes,
        slave_id.clone(),
        grpc_client.clone(),
        config.grpc_shared_token.clone(),
    );
    let _ = monitor.update_and_detect().await;

    // 6. 실시간 감시 루프
    #[cfg(target_os = "windows")]
    {
        use tokio::sync::mpsc;
        use process_monitor::WmiProcessEvent;

        println!("🔍 초기 프로세스 맵핑 완료. 실시간 WMI 기반 감시를 시작합니다...");

        let (tx, mut rx) = mpsc::channel::<WmiProcessEvent>(100);

        // 백그라운드 WMI 모니터 스레드 기동
        process_monitor::start_wmi_monitor(tx);

        while let Some(event) = rx.recv().await {
            monitor.handle_wmi_event(event).await;
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        println!("🔍 초기 프로세스 맵핑 완료. (비-Windows) 100ms 주기로 실시간 감시를 시작합니다...");
        loop {
            // 100ms 대기 적용 (CPU 부하 최소화)
            sleep(Duration::from_millis(100)).await;

            // 스냅샷을 찍고 변경점을 즉시 탐지
            if let Err(e) = monitor.update_and_detect().await {
                eprintln!("⚠️ 프로세스 목록 업데이트 실패: {}", e);
            }
        }
    }

    #[allow(unreachable_code)]
    Ok(())
}
