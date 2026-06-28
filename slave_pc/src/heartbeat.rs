use std::time::Duration;
use tokio::time::sleep;
use tonic::transport::Channel;

use crate::pb::check_node_client::CheckNodeClient;
use crate::pb::SlaveId; // protobuf definition for SlaveId

pub async fn start_heartbeat_loop(
    mut client: CheckNodeClient<Channel>,
    slave_id: String,
    grpc_shared_token: Option<String>,
) {
    println!("💓 30초 주기의 Heartbeat 백그라운드 태스크 시작됨.");
    loop {
        // 30초 대기
        sleep(Duration::from_secs(30)).await;

        let mut req = tonic::Request::new(SlaveId {
            id: slave_id.clone(),
        });
        if let Err(e) = crate::grpc_auth::attach_shared_token(&mut req, grpc_shared_token.as_deref()) {
            eprintln!("⚠️ Heartbeat gRPC shared token metadata 설정 실패: {}", e);
            continue;
        }

        match client.heartbeat(req).await {
            Ok(_) => {
                // Heartbeat 전송 성공 (불필요한 로그 최소화를 위해 출력 생략 혹은 필요시 추가)
            }
            Err(e) => {
                eprintln!("⚠️ Heartbeat 전송 실패: {}", e);
            }
        }
    }
}
