use turtle_tally_domain::error::{DomainError, DomainResult};
use turtle_tally_domain::types::{
    DownloadGrant, Receipt, RequestUploadInput, UploadGrant, UploadMediaType,
};
use turtle_tally_domain::validation::valid_name;

use super::FinanceService;
use crate::ports::{
    Actor, AuditAction, EntityWrite, FinanceStore, ObjectStore, Owner, PendingUpload,
};

const MAX_UPLOAD_BYTES: u64 = 10 * 1024 * 1024;
const MIN_CHECKSUM_LENGTH: usize = 8;

impl<S: FinanceStore, O: ObjectStore> FinanceService<S, O> {
    /// Bytes never pass through the API (ADR 0003). The client writes to the
    /// granted URL and reports what it wrote; the server checks that against
    /// what the store actually holds.
    pub async fn request_receipt_upload(
        &self,
        owner: &Owner,
        input: &RequestUploadInput,
    ) -> DomainResult<UploadGrant> {
        let file_name = valid_name(&input.file_name, "File name")?;
        if input.size_bytes == 0 || input.size_bytes > MAX_UPLOAD_BYTES {
            return Err(DomainError::validation(
                "That file is empty or larger than the upload limit.",
            ));
        }
        if !matches!(
            input.media_type,
            UploadMediaType::ApplicationPdf
                | UploadMediaType::ImageJpeg
                | UploadMediaType::ImagePng
        ) {
            return Err(DomainError::validation(
                "Receipts must be a PDF, JPEG, or PNG.",
            ));
        }

        let id = self.ids.next("receipt");
        let key = receipt_key(owner, &id);
        let grant = self
            .objects
            .upload_grant(&key, input.media_type, input.size_bytes)
            .await?;

        let expires_at = grant
            .expires_at
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        self.store
            .put_pending_upload(
                owner,
                &PendingUpload {
                    id: id.clone(),
                    key,
                    file_name,
                    media_type: input.media_type,
                    size_bytes: input.size_bytes,
                    expires_at: expires_at.clone(),
                },
            )
            .await?;

        Ok(UploadGrant {
            upload_id: id,
            upload_url: grant.url,
            expires_at,
        })
    }

    pub async fn complete_receipt_upload(
        &self,
        owner: &Owner,
        actor: Actor,
        upload_id: &str,
        checksum: &str,
    ) -> DomainResult<Receipt> {
        if checksum.len() < MIN_CHECKSUM_LENGTH
            || !checksum.chars().all(|value| value.is_ascii_hexdigit())
        {
            return Err(DomainError::validation(
                "A completed upload must report its checksum.",
            ));
        }

        let pending = self
            .store
            .take_pending_upload(owner, upload_id)
            .await?
            .ok_or_else(|| DomainError::not_found("That upload was not found or has expired."))?;

        let stored = self
            .objects
            .stored_checksum(&pending.key)
            .await?
            .ok_or_else(|| DomainError::not_found("That upload was not found or has expired."))?;
        if !stored.eq_ignore_ascii_case(checksum) {
            return Err(DomainError::validation(
                "The stored file does not match the checksum reported for it.",
            ));
        }

        let receipt = Receipt {
            id: pending.id,
            file_name: pending.file_name,
            media_type: pending.media_type,
            size_bytes: pending.size_bytes,
            checksum: checksum.to_lowercase(),
        };
        let audit = self.audit(AuditAction::ReceiptAttached, actor, &receipt.id, 1);
        self.store
            .put_receipt(
                owner,
                EntityWrite {
                    entity: &receipt,
                    expected_version: None,
                    audit: &audit,
                },
            )
            .await?;
        Ok(receipt)
    }

    pub async fn receipt_download_url(
        &self,
        owner: &Owner,
        receipt_id: &str,
    ) -> DomainResult<DownloadGrant> {
        self.require_receipt(owner, receipt_id).await?;
        let grant = self
            .objects
            .download_grant(&receipt_key(owner, receipt_id))
            .await?;
        Ok(DownloadGrant {
            url: grant.url,
            expires_at: grant
                .expires_at
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        })
    }

    pub(crate) async fn require_receipt(
        &self,
        owner: &Owner,
        receipt_id: &str,
    ) -> DomainResult<Receipt> {
        self.store
            .receipt(owner, receipt_id)
            .await?
            .ok_or_else(|| DomainError::not_found("Receipt not found. Upload it again."))
    }
}

/// A record references an object the server already holds, by an identifier the
/// server issued, so the key is derived rather than supplied.
fn receipt_key(owner: &Owner, receipt_id: &str) -> String {
    format!("receipts/{}/{receipt_id}", owner.as_str())
}
