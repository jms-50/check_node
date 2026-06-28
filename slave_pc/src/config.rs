use std::env;

pub struct Config {
    pub server_url: String,
    pub hostname: String,
    pub grpc_shared_token: Option<String>,
}

impl Config {
    pub fn load() -> Self {
        // .env 파일 로드를 시도합니다. 파일이 없는 경우 에러를 무시하고 환경변수 조회를 시도합니다.
        let _ = dotenvy::dotenv();

        let server_url = env::var("SERVER_URL")
            .unwrap_or_else(|_| "http://localhost:50051".to_string());

        let hostname = env::var("HOSTNAME")
            .or_else(|_| env::var("COMPUTERNAME"))
            .unwrap_or_else(|_| "Windows-Agent-01".to_string());

        let grpc_shared_token = env::var("GRPC_SHARED_TOKEN")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        Self {
            server_url,
            hostname,
            grpc_shared_token,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_loading_flow() {
        // 병렬 테스트 러너의 간섭을 방지하기 위해 단일 테스트 스레드처럼 순차적으로 시나리오를 실행합니다.
        
        // 1. 기존 .env 백업
        let has_dotenv = std::path::Path::new(".env").exists();
        if has_dotenv {
            std::fs::rename(".env", ".env.backup").unwrap();
        }

        // --- 시나리오 A: 기본값 폴백 확인 (환경변수 및 .env 부재) ---
        unsafe {
            std::env::remove_var("SERVER_URL");
            std::env::remove_var("HOSTNAME");
            std::env::remove_var("COMPUTERNAME");
            std::env::remove_var("GRPC_SHARED_TOKEN");
        }

        let config_default = Config::load();
        assert_eq!(config_default.server_url, "http://localhost:50051");
        assert_eq!(config_default.hostname, "Windows-Agent-01");
        assert_eq!(config_default.grpc_shared_token, None);

        // --- 시나리오 B: 시스템 환경변수 우선 적용 확인 ---
        unsafe {
            std::env::set_var("SERVER_URL", "http://test-server:12345");
            std::env::set_var("HOSTNAME", "Test-Agent-99");
            std::env::set_var("GRPC_SHARED_TOKEN", "test-token");
        }

        let config_env = Config::load();
        assert_eq!(config_env.server_url, "http://test-server:12345");
        assert_eq!(config_env.hostname, "Test-Agent-99");
        assert_eq!(config_env.grpc_shared_token.as_deref(), Some("test-token"));

        unsafe {
            std::env::remove_var("SERVER_URL");
            std::env::remove_var("HOSTNAME");
            std::env::remove_var("GRPC_SHARED_TOKEN");
        }

        // --- 시나리오 C: .env 파일을 통한 로드 확인 ---
        let env_content = "SERVER_URL=http://dotenv-server:54321\nHOSTNAME=Dotenv-Agent\nGRPC_SHARED_TOKEN=dotenv-token\n";
        std::fs::write(".env", env_content).unwrap();

        let config_dotenv = Config::load();

        std::fs::remove_file(".env").unwrap();

        assert_eq!(config_dotenv.server_url, "http://dotenv-server:54321");
        assert_eq!(config_dotenv.hostname, "Dotenv-Agent");
        assert_eq!(config_dotenv.grpc_shared_token.as_deref(), Some("dotenv-token"));

        // 2. 기존 .env 복구
        if has_dotenv {
            std::fs::rename(".env.backup", ".env").unwrap();
        }
    }
}
