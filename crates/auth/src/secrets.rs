use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::TryRng;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use turtle_tally_domain::error::{DomainError, DomainResult};

const SECRET_BYTES: usize = 32;

/// Session identifiers, CSRF tokens, OAuth state, and PKCE verifiers are all
/// the same thing: a value an attacker must not be able to guess or replay.
pub fn random_secret() -> DomainResult<String> {
    let mut bytes = [0_u8; SECRET_BYTES];
    rand::rngs::SysRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| DomainError::validation("The system random source is unavailable."))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

/// Stored at rest as a digest, so a leaked table cannot be replayed as a live
/// session or a valid confirmation token.
pub fn digest(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

/// Comparison time must not depend on how much of the value matched.
pub fn matches_digest(value: &str, expected_digest: &str) -> bool {
    digest(value)
        .as_bytes()
        .ct_eq(expected_digest.as_bytes())
        .into()
}

/// PKCE S256: the authorisation request carries the challenge, and only the
/// holder of the verifier can redeem the code it returns.
pub fn code_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_secret_is_long_and_never_repeats() {
        let first = random_secret().expect("a random value");
        let second = random_secret().expect("a random value");
        assert_ne!(first, second);
        assert!(first.len() >= 43);
    }

    #[test]
    fn a_digest_matches_only_its_own_value() {
        let secret = random_secret().expect("a random value");
        let stored = digest(&secret);
        assert!(matches_digest(&secret, &stored));
        assert!(!matches_digest("something else", &stored));
        assert_ne!(stored, secret);
    }

    #[test]
    fn a_challenge_is_the_verifier_hashed_rather_than_the_verifier() {
        let verifier = random_secret().expect("a random value");
        let challenge = code_challenge(&verifier);
        assert_ne!(challenge, verifier);
        assert_eq!(challenge, code_challenge(&verifier));
    }
}
