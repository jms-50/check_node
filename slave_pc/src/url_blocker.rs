use std::fs;
use std::path::Path;
use std::process::Command;

const HOSTS_PATH: &str = if cfg!(target_os = "windows") {
    r#"C:\Windows\System32\drivers\etc\hosts"#
} else {
    "/etc/hosts"
};

const MARKER_START: &str = "# --- CHECK_NODE_START ---";
const MARKER_END: &str = "# --- CHECK_NODE_END ---";

/// 차단할 도메인(또는 호스트네임) 목록을 기반으로 hosts 파일을 업데이트하고 DNS 캐시를 지웁니다.
pub fn apply_blocked_urls(urls: &[String]) -> std::io::Result<()> {
    let path = Path::new(HOSTS_PATH);
    
    // 1. 기존 hosts 파일 내용 읽기
    let mut content = String::new();
    if path.exists() {
        content = fs::read_to_string(path)?;
    }

    // 2. 마커 사이의 기존 내용 제거
    let mut new_content = String::new();
    let mut in_block = false;
    for line in content.lines() {
        if line == MARKER_START {
            in_block = true;
            continue;
        }
        if line == MARKER_END {
            in_block = false;
            continue;
        }
        if !in_block {
            new_content.push_str(line);
            new_content.push('\n');
        }
    }

    // 파일 끝에 개행문자가 없으면 추가
    if !new_content.ends_with('\n') && !new_content.is_empty() {
        new_content.push('\n');
    }

    // 3. 차단할 URL이 있다면 마커와 함께 내용 추가
    if !urls.is_empty() {
        new_content.push_str(MARKER_START);
        new_content.push('\n');
        for url in urls {
            // "127.0.0.1 도메인" 형식으로 추가
            let trimmed = url.trim();
            if !trimmed.is_empty() {
                new_content.push_str(&format!("127.0.0.1 {}\n", trimmed));
            }
        }
        new_content.push_str(MARKER_END);
        new_content.push('\n');
    }

    // 4. hosts 파일에 쓰기
    // 관리자 권한이 없으면 이 단계에서 권한 오류(PermissionDenied) 발생
    match fs::write(path, new_content) {
        Ok(_) => {
            println!("✅ hosts 파일 업데이트 성공");
        }
        Err(e) => {
            eprintln!("❌ hosts 파일 쓰기 실패 (관리자 권한이 필요할 수 있습니다): {}", e);
            return Err(e);
        }
    }

    // 5. DNS 플러시 (Windows 전용)
    if cfg!(target_os = "windows") {
        if let Err(e) = Command::new("ipconfig")
            .arg("/flushdns")
            .output()
        {
            eprintln!("⚠️ DNS 플러시 실패: {}", e);
        } else {
            println!("🔄 DNS 캐시 플러시 완료");
        }
    }

    Ok(())
}
