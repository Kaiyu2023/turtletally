use std::time::Duration;

use aws_sdk_s3::Client;
use aws_sdk_s3::presigning::PresigningConfig;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{TimeDelta, Utc};
use sha2::{Digest, Sha256};
use turtle_tally_application::ports::{GrantedUrl, ObjectStore};
use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::types::UploadMediaType;

/// A grant is short lived: long enough for one upload from a page the owner is
/// already looking at, and not long enough to be worth passing on.
const UPLOAD_GRANT: Duration = Duration::from_secs(15 * 60);
const DOWNLOAD_GRANT: Duration = Duration::from_secs(5 * 60);

pub struct S3ObjectStore {
    client: Client,
    bucket: String,
}

impl S3ObjectStore {
    pub fn new(client: Client, bucket: impl Into<String>) -> Self {
        Self {
            client,
            bucket: bucket.into(),
        }
    }

    fn expires_at(window: Duration) -> DomainResult<chrono::DateTime<Utc>> {
        let delta = TimeDelta::from_std(window)
            .map_err(|_| DomainError::validation("The grant window is not a usable duration."))?;
        Ok(Utc::now() + delta)
    }
}

impl ObjectStore for S3ObjectStore {
    /// The grant fixes the content type and length, so the URL cannot be reused
    /// to write something else.
    async fn upload_grant(
        &self,
        key: &str,
        media_type: UploadMediaType,
        size_bytes: u64,
    ) -> DomainResult<GrantedUrl> {
        let config = PresigningConfig::expires_in(UPLOAD_GRANT).map_err(|error| {
            DomainError::validation(format!("The grant could not be signed: {error}"))
        })?;

        let request = self
            .client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .content_type(media_type_name(media_type))
            .content_length(i64::try_from(size_bytes).unwrap_or(i64::MAX))
            .presigned(config)
            .await
            .map_err(|error| {
                DomainError::validation(format!("The grant could not be signed: {error}"))
            })?;

        Ok(GrantedUrl {
            url: request.uri().to_owned(),
            expires_at: Self::expires_at(UPLOAD_GRANT)?,
        })
    }

    async fn download_grant(&self, key: &str) -> DomainResult<GrantedUrl> {
        let config = PresigningConfig::expires_in(DOWNLOAD_GRANT).map_err(|error| {
            DomainError::validation(format!("The grant could not be signed: {error}"))
        })?;

        let request = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .presigned(config)
            .await
            .map_err(|error| {
                DomainError::validation(format!("The grant could not be signed: {error}"))
            })?;

        Ok(GrantedUrl {
            url: request.uri().to_owned(),
            expires_at: Self::expires_at(DOWNLOAD_GRANT)?,
        })
    }

    /// ADR 0003 has the server verify the stored object against the checksum the
    /// client reports. S3 returns its own digest when the upload carried one;
    /// otherwise the object is read once and hashed, which the upload limit
    /// keeps small.
    async fn stored_checksum(&self, key: &str) -> DomainResult<Option<String>> {
        let head = match self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
        {
            Ok(head) => head,
            Err(error) => {
                return if format!("{}", aws_sdk_s3::error::DisplayErrorContext(&error))
                    .contains("NotFound")
                {
                    Ok(None)
                } else {
                    Err(DomainError::validation(
                        "The stored object could not be read.",
                    ))
                };
            }
        };

        if let Some(digest) = head.checksum_sha256() {
            return Ok(Some(hex_of_base64(digest)?));
        }

        let object = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await
            .map_err(|_| DomainError::validation("The stored object could not be read."))?;
        let bytes = object
            .body
            .collect()
            .await
            .map_err(|_| DomainError::validation("The stored object could not be read."))?
            .into_bytes();

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        Ok(Some(hex_of(&hasher.finalize())))
    }
}

fn media_type_name(media_type: UploadMediaType) -> &'static str {
    match media_type {
        UploadMediaType::ApplicationPdf => "application/pdf",
        UploadMediaType::ImageJpeg => "image/jpeg",
        UploadMediaType::ImagePng => "image/png",
    }
}

fn hex_of_base64(digest: &str) -> DomainResult<String> {
    let bytes = STANDARD.decode(digest).map_err(|_| {
        DomainError::validation("The stored object carries an unreadable checksum.")
    })?;
    Ok(hex_of(&bytes))
}

fn hex_of(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_digest_is_compared_in_the_form_the_contract_uses() {
        // The SHA-256 of an empty input, as S3 reports it and as the browser
        // computes it.
        let base64 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=";
        assert_eq!(
            hex_of_base64(base64).expect("a readable digest"),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert!(hex_of_base64("not base64!").is_err());
    }
}
