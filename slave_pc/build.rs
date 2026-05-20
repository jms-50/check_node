fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 파일이 변경될 때만 다시 빌드
    println!("cargo:rerun-if-changed=../pb/service.proto");

    // 파일 경로와 기준(include) 폴더를 명시적으로 분리해서 전달
    tonic_build::configure().compile(
        &["../pb/service.proto"], // 1. 컴파일할 proto 파일 위치
        &["../pb"],               // 2. protoc가 참조할 기준 폴더 위치
    )?;

    Ok(())
}
