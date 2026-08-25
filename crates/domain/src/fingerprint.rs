use crate::calendar::LocalDate;

/// An import row identifies itself by its own content, so re-importing the same
/// statement recognises what it already created. The hash is FNV-1a over the
/// UTF-16 code units of the normalised row, which is what
/// `apps/web/src/data/fingerprint.ts` computes.
pub struct SourceRow<'a> {
    pub account_id: &'a str,
    pub local_date: &'a LocalDate,
    pub description: &'a str,
    pub amount_minor: i64,
}

pub fn row_fingerprint(row: &SourceRow<'_>) -> String {
    let normalised = normalise(row.description);
    hash(&format!(
        "{}|{}|{}|{normalised}",
        row.account_id, row.local_date, row.amount_minor
    ))
}

pub fn batch_content_hash(file_name: &str, fingerprints: &[String]) -> String {
    hash(&format!(
        "{}|{}",
        file_name.trim().to_lowercase(),
        fingerprints.join(",")
    ))
}

fn normalise(description: &str) -> String {
    description
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn hash(value: &str) -> String {
    let mut result: u32 = 0x811c_9dc5;
    for unit in value.encode_utf16() {
        result ^= u32::from(unit);
        result = result.wrapping_mul(0x0100_0193);
    }
    format!("{result:08x}")
}
