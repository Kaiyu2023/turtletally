use aws_sdk_kms::Client;
use aws_sdk_kms::primitives::Blob;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use turtle_tally_auth::session::TokenCipher;
use turtle_tally_domain::error::{DomainError, DomainResult};

const CONTEXT_KEY: &str = "session";

/// The refresh token is encrypted under a key the table cannot use, and bound
/// to the session it belongs to: ciphertext lifted into another session's row
/// fails to decrypt rather than granting that session a token.
pub struct KmsTokenCipher {
    client: Client,
    key_id: String,
}

impl KmsTokenCipher {
    pub fn new(client: Client, key_id: impl Into<String>) -> Self {
        Self {
            client,
            key_id: key_id.into(),
        }
    }
}

impl TokenCipher for KmsTokenCipher {
    async fn encrypt(&self, plaintext: &str, context: &str) -> DomainResult<String> {
        let response = self
            .client
            .encrypt()
            .key_id(&self.key_id)
            .plaintext(Blob::new(plaintext.as_bytes()))
            .encryption_context(CONTEXT_KEY, context)
            .send()
            .await
            .map_err(|_| DomainError::validation("The session could not be secured."))?;

        response
            .ciphertext_blob
            .map(|blob| STANDARD.encode(blob.into_inner()))
            .ok_or_else(|| DomainError::validation("The session could not be secured."))
    }

    async fn decrypt(&self, ciphertext: &str, context: &str) -> DomainResult<String> {
        let blob = STANDARD
            .decode(ciphertext)
            .map_err(|_| DomainError::unauthenticated("The session could not be read."))?;

        let response = self
            .client
            .decrypt()
            .key_id(&self.key_id)
            .ciphertext_blob(Blob::new(blob))
            .encryption_context(CONTEXT_KEY, context)
            .send()
            .await
            .map_err(|_| DomainError::unauthenticated("The session could not be read."))?;

        let plaintext = response
            .plaintext
            .ok_or_else(|| DomainError::unauthenticated("The session could not be read."))?;
        String::from_utf8(plaintext.into_inner())
            .map_err(|_| DomainError::unauthenticated("The session could not be read."))
    }
}
