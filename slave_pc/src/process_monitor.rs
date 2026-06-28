use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use crate::pb::check_node_client::CheckNodeClient;
use tonic::transport::Channel;

pub struct ProcessInfo {
    pub name: String,
    pub generation: u64, // 세대 카운터 (스냅샷 회차 기록용)
}

#[derive(Debug, Clone)]
pub enum WmiProcessEvent {
    Start { pid: u32, name: String },
    Stop { pid: u32, name: String },
}

#[allow(dead_code)]
pub struct ProcessMonitor {
    processes: HashMap<u32, ProcessInfo>,
    current_gen: u64,
    blocked_processes: Arc<RwLock<Vec<String>>>,
    slave_id: String,
    grpc_client: CheckNodeClient<Channel>,
    grpc_shared_token: Option<String>,
}

impl ProcessMonitor {
    pub fn new(
        blocked_processes: Arc<RwLock<Vec<String>>>,
        slave_id: String,
        grpc_client: CheckNodeClient<Channel>,
        grpc_shared_token: Option<String>,
    ) -> Self {
        Self {
            processes: HashMap::with_capacity(500), // Map 재할당 방지를 위한 초기 용량 확보
            current_gen: 0,
            blocked_processes,
            slave_id,
            grpc_client,
            grpc_shared_token,
        }
    }
}

// =========================================================================
// 1. Windows 전용 구현
// =========================================================================
#[cfg(target_os = "windows")]
impl ProcessMonitor {
    // 핵심 알고리즘: Mark and Sweep 탐지
    pub async fn update_and_detect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        use crate::policy::is_blocked_process;
        use crate::reporter::report_violation;
        use windows::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
        use windows::Win32::System::Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
        };

        self.current_gen += 1; // 세대 증가

        unsafe {
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)?;
            if snapshot == INVALID_HANDLE_VALUE {
                return Err("스냅샷 생성 실패".into());
            }

            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry).is_err() {
                let _ = CloseHandle(snapshot);
                return Err("첫 번째 프로세스 읽기 실패".into());
            }

            // [Mark 단계] 스냅샷을 훑으며 생성 및 갱신 처리
            loop {
                let pid = entry.th32ProcessID;
                let exe_name = utf16_to_string(&entry.szExeFile);

                if let Some(info) = self.processes.get_mut(&pid) {
                    if info.name.eq_ignore_ascii_case(&exe_name) {
                        // [유지] 기존 프로세스 생존 신고
                        info.generation = self.current_gen;
                    } else {
                        // [PID 재사용 감지] 이전 프로세스가 죽고, 같은 PID로 새 프로세스가 켜짐
                        println!(
                            "[-] 프로세스 종료 (PID 재사용) -> PID: {:<5} | Name: {}",
                            pid, info.name
                        );
                        println!(
                            "[+] 프로세스 생성 (PID 재사용) -> PID: {:<5} | Name: {}",
                            pid, exe_name
                        );

                        info.name = exe_name.clone();
                        info.generation = self.current_gen;

                        // 차단 검사
                        if is_blocked_process(&self.blocked_processes, &exe_name).await {
                            kill_process(pid, &exe_name);
                            report_violation(
                                self.grpc_client.clone(),
                                self.slave_id.clone(),
                                exe_name,
                                self.grpc_shared_token.clone(),
                            )
                            .await;
                        }
                    }
                } else {
                    // [신규 생성 감지]
                    println!(
                        "[+] 프로세스 생성 감지 -> PID: {:<5} | Name: {}",
                        pid, exe_name
                    );
                    self.processes.insert(
                        pid,
                        ProcessInfo {
                            name: exe_name.clone(),
                            generation: self.current_gen,
                        },
                    );

                    // 차단 검사
                    if is_blocked_process(&self.blocked_processes, &exe_name).await {
                        kill_process(pid, &exe_name);
                        report_violation(
                            self.grpc_client.clone(),
                            self.slave_id.clone(),
                            exe_name,
                            self.grpc_shared_token.clone(),
                        )
                        .await;
                    }
                }

                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
            let _ = CloseHandle(snapshot);
        }

        // [Sweep 단계] 이번 세대(Generation) 도장을 못 받은 프로세스는 종료된 것임
        self.processes.retain(|pid, info| {
            if info.generation != self.current_gen {
                println!(
                    "[-] 프로세스 종료 감지 -> PID: {:<5} | Name: {}",
                    pid, info.name
                );
                false // false를 반환하면 Map에서 삭제됨
            } else {
                true
            }
        });

        Ok(())
    }

    pub async fn handle_wmi_event(&mut self, event: WmiProcessEvent) {
        use crate::policy::is_blocked_process;
        use crate::reporter::report_violation;

        match event {
            WmiProcessEvent::Start { pid, name } => {
                println!(
                    "[+] 프로세스 생성 감지 (WMI) -> PID: {:<5} | Name: {}",
                    pid, name
                );

                self.processes.insert(
                    pid,
                    ProcessInfo {
                        name: name.clone(),
                        generation: self.current_gen,
                    },
                );

                if is_blocked_process(&self.blocked_processes, &name).await {
                    kill_process(pid, &name);
                    report_violation(
                        self.grpc_client.clone(),
                        self.slave_id.clone(),
                        name,
                        self.grpc_shared_token.clone(),
                    )
                    .await;
                }
            }
            WmiProcessEvent::Stop { pid, name } => {
                println!(
                    "[-] 프로세스 종료 감지 (WMI) -> PID: {:<5} | Name: {}",
                    pid, name
                );

                self.processes.remove(&pid);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn utf16_to_string(slice: &[u16]) -> String {
    let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
    String::from_utf16_lossy(&slice[..end])
}

#[cfg(target_os = "windows")]
fn kill_process(pid: u32, name: &str) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_TERMINATE, TerminateProcess};

    unsafe {
        match OpenProcess(PROCESS_TERMINATE, false, pid) {
            Ok(handle) => {
                if TerminateProcess(handle, 1).is_ok() {
                    println!("🛡️ 차단 성공 [{}] (PID: {}) 강제 종료됨", name, pid);
                } else {
                    eprintln!("❌ 차단 실패 [{}] (PID: {})", name, pid);
                }
                let _ = CloseHandle(handle);
            }
            Err(e) => {
                eprintln!(
                    "❌ 차단 실패(OpenProcess 에러) [{}] (PID: {}): {}",
                    name, pid, e
                );
            }
        }
    }
}

#[cfg(target_os = "windows")]
pub fn start_wmi_monitor(event_tx: tokio::sync::mpsc::Sender<WmiProcessEvent>) {
    use std::thread;

    let tx_start = event_tx.clone();
    thread::spawn(move || {
        if let Err(e) = run_wmi_start_loop(tx_start) {
            eprintln!("❌ WMI Start Monitor Error: {:?}", e);
        }
    });

    let tx_stop = event_tx;
    thread::spawn(move || {
        if let Err(e) = run_wmi_stop_loop(tx_stop) {
            eprintln!("❌ WMI Stop Monitor Error: {:?}", e);
        }
    });
}

#[cfg(target_os = "windows")]
fn run_wmi_start_loop(
    event_tx: tokio::sync::mpsc::Sender<WmiProcessEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use wmi::{COMLibrary, WMIConnection};
    use serde::Deserialize;

    #[derive(Deserialize, Debug)]
    struct Win32_ProcessStartTrace {
        #[serde(rename = "ProcessID")]
        process_id: u32,
        #[serde(rename = "ProcessName")]
        process_name: String,
    }

    let com_lib = COMLibrary::new()?;
    let wmi_con = WMIConnection::new(com_lib)?;
    let iterator = wmi_con.notification::<Win32_ProcessStartTrace>()?;

    for event in iterator {
        match event {
            Ok(evt) => {
                let ev = WmiProcessEvent::Start {
                    pid: evt.process_id,
                    name: evt.process_name,
                };
                if event_tx.blocking_send(ev).is_err() {
                    break;
                }
            }
            Err(e) => {
                eprintln!("⚠️ WMI Start Event Error: {:?}", e);
            }
        }
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn run_wmi_stop_loop(
    event_tx: tokio::sync::mpsc::Sender<WmiProcessEvent>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    use wmi::{COMLibrary, WMIConnection};
    use serde::Deserialize;

    #[derive(Deserialize, Debug)]
    struct Win32_ProcessStopTrace {
        #[serde(rename = "ProcessID")]
        process_id: u32,
        #[serde(rename = "ProcessName")]
        process_name: String,
    }

    let com_lib = COMLibrary::new()?;
    let wmi_con = WMIConnection::new(com_lib)?;
    let iterator = wmi_con.notification::<Win32_ProcessStopTrace>()?;

    for event in iterator {
        match event {
            Ok(evt) => {
                let ev = WmiProcessEvent::Stop {
                    pid: evt.process_id,
                    name: evt.process_name,
                };
                if event_tx.blocking_send(ev).is_err() {
                    break;
                }
            }
            Err(e) => {
                eprintln!("⚠️ WMI Stop Event Error: {:?}", e);
            }
        }
    }

    Ok(())
}

// =========================================================================
// 2. 비-Windows (macOS, Linux 등 개발 환경) 모의 구현
// =========================================================================
#[cfg(not(target_os = "windows"))]
impl ProcessMonitor {
    pub async fn update_and_detect(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        use crate::policy::is_blocked_process;
        use crate::reporter::report_violation;
        use std::process::Command;

        self.current_gen += 1;

        // macOS/Linux에서 ps 명령어로 실행 중인 프로세스 목록 가져오기
        let output = Command::new("ps")
            .args(&["-Ao", "pid,comm"])
            .output()?;

        if !output.status.success() {
            return Err("ps 명령어 실행 실패".into());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut lines = stdout.lines();
        // 첫 번째 라인은 헤더(PID COMM)이므로 건너뜁니다.
        let _header = lines.next();

        for line in lines {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }

            let pid_str = parts[0];
            let raw_path = parts[1..].join(" "); // 공백이 포함된 경로 대응

            let pid = match pid_str.parse::<u32>() {
                Ok(p) => p,
                Err(_) => continue,
            };

            // 경로에서 마지막 파일명만 추출
            let exe_name = std::path::Path::new(&raw_path)
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| raw_path.clone());

            if let Some(info) = self.processes.get_mut(&pid) {
                if info.name.eq_ignore_ascii_case(&exe_name) {
                    // [유지] 기존 프로세스 생존 신고
                    info.generation = self.current_gen;
                } else {
                    // [PID 재사용 감지]
                    println!(
                        "[-] 프로세스 종료 (PID 재사용) -> PID: {:<5} | Name: {}",
                        pid, info.name
                    );
                    println!(
                        "[+] 프로세스 생성 (PID 재사용) -> PID: {:<5} | Name: {}",
                        pid, exe_name
                    );

                    info.name = exe_name.clone();
                    info.generation = self.current_gen;

                    if is_blocked_process(&self.blocked_processes, &exe_name).await {
                        kill_process(pid, &exe_name);
                        report_violation(
                            self.grpc_client.clone(),
                            self.slave_id.clone(),
                            exe_name,
                            self.grpc_shared_token.clone(),
                        )
                        .await;
                    }
                }
            } else {
                // [신규 생성 감지]
                println!(
                    "[+] 프로세스 생성 감지 -> PID: {:<5} | Name: {}",
                    pid, exe_name
                );
                self.processes.insert(
                    pid,
                    ProcessInfo {
                        name: exe_name.clone(),
                        generation: self.current_gen,
                    },
                );

                if is_blocked_process(&self.blocked_processes, &exe_name).await {
                    kill_process(pid, &exe_name);
                    report_violation(
                        self.grpc_client.clone(),
                        self.slave_id.clone(),
                        exe_name,
                        self.grpc_shared_token.clone(),
                    )
                    .await;
                }
            }
        }

        // [Sweep 단계]
        self.processes.retain(|pid, info| {
            if info.generation != self.current_gen {
                println!(
                    "[-] 프로세스 종료 감지 -> PID: {:<5} | Name: {}",
                    pid, info.name
                );
                false
            } else {
                true
            }
        });

        Ok(())
    }
}

#[cfg(not(target_os = "windows"))]
fn kill_process(pid: u32, name: &str) {
    use std::process::Command;
    match Command::new("kill").args(&["-9", &pid.to_string()]).output() {
        Ok(output) => {
            if output.status.success() {
                println!("🛡️ 차단 성공 [{}] (PID: {}) 강제 종료됨", name, pid);
            } else {
                eprintln!(
                    "❌ 차단 실패 [{}] (PID: {}): {}",
                    name,
                    pid,
                    String::from_utf8_lossy(&output.stderr).trim()
                );
            }
        }
        Err(e) => {
            eprintln!("❌ 차단 실패(kill 실행 에러) [{}] (PID: {}): {}", name, pid, e);
        }
    }
}
