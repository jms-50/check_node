const GRPC_TOKEN_HEADER: &str = "x-checknode-token";

pub fn attach_shared_token<T>(
    request: &mut tonic::Request<T>,
    token: Option<&str>,
) -> Result<(), tonic::metadata::errors::InvalidMetadataValue> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };

    request
        .metadata_mut()
        .insert(GRPC_TOKEN_HEADER, token.try_into()?);
    Ok(())
}
