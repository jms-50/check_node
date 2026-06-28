use std::time::{SystemTime, UNIX_EPOCH};
use crate::pb::check_node_client::CheckNodeClient;
use crate::pb::EventLog;
use tonic::transport::Channel;

// 위반 사항 서버에 보고 (Fire and forget 방식으로 호출 권장)
pub async fn report_violation(
    mut client: CheckNodeClient<Channel>,
    slave_id: String,
    target: String,
    grpc_shared_token: Option<String>,
) {
    // 100ms 루프 방해 안 하도록 tokio::spawn 내부에서 실행됨
    tokio::spawn(async move {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        let mut req = tonic::Request::new(EventLog {
            slave_id,
            target: target.clone(),
            r#type: "PROCESS_BLOCKED".to_string(), // type은 예약어이므로 r#type 사용
            timestamp,
        });
        if let Err(e) = crate::grpc_auth::attach_shared_token(&mut req, grpc_shared_token.as_deref()) {
            eprintln!("❌ gRPC shared token metadata 설정 실패: {}", e);
            return;
        }

        match client.report_event(req).await {
            Ok(_) => println!("📡 위반 이벤트 서버 보고 완료: {}", target),
            Err(e) => eprintln!("❌ 서버 보고 실패: {}", e),
        }
    });
}
