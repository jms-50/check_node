use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::sleep;
use crate::pb::check_node_client::CheckNodeClient;
use crate::pb::SlaveId;
use tonic::transport::Channel;

// 마스터 서버로부터 차단 정책 스트림 수신
pub async fn get_stream_recv(
    mut client: CheckNodeClient<Channel>,
    slave_id: String,
    blocked_processes: Arc<RwLock<Vec<String>>>,
    grpc_shared_token: Option<String>,
) {
    let mut current_urls: Vec<String> = Vec::new();

    loop {
        // 재연결을 위한 외부 루프
        let mut req = tonic::Request::new(SlaveId {
            id: slave_id.clone(),
        });
        if let Err(e) = crate::grpc_auth::attach_shared_token(&mut req, grpc_shared_token.as_deref()) {
            eprintln!("⚠️ gRPC shared token metadata 설정 실패: {}", e);
            sleep(Duration::from_secs(5)).await;
            continue;
        }

        match client.subscribe_policy(req).await {
            Ok(response) => {
                let mut stream = response.into_inner();

                // 데이터 수신 내부 루프
                while let Ok(Some(policy)) = stream.message().await {
                    // 수신받은 프로세스 데이터를 안전하게 업데이트
                    {
                        let mut list = blocked_processes.write().await;
                        *list = policy.blocked_processes;
                        println!("🚫 업데이트된 차단 프로세스 목록: {:?}", *list);
                    }

                    // URL 정책 처리
                    if current_urls != policy.blocked_urls {
                        println!("🚫 업데이트된 차단 URL 목록: {:?}", policy.blocked_urls);
                        current_urls = policy.blocked_urls.clone();

                        // hosts 파일 갱신 및 DNS 플러시 실행
                        if let Err(e) = crate::url_blocker::apply_blocked_urls(&current_urls) {
                            eprintln!("⚠️ URL 차단 적용 실패: {}", e);
                        }
                    }
                }
                eprintln!("❌ 스트림 수신 에러 (서버 연결 끊김 등). 2초 후 재구독 시도...");
                sleep(Duration::from_secs(2)).await;
            }
            Err(e) => {
                eprintln!("⚠️ 정책 구독 연결 실패. 5초 후 재시도... : {}", e);
                sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

// 차단 목록에 있는지 검사 (읽기 락 적용)
pub async fn is_blocked_process(blocked_list: &Arc<RwLock<Vec<String>>>, process_name: &str) -> bool {
    let list = blocked_list.read().await;
    for blocked_name in list.iter() {
        if blocked_name.eq_ignore_ascii_case(process_name) {
            return true;
        }
    }
    false
}
