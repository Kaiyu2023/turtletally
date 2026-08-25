use crate::types::TransactionFlow;

/// Money out is negative, money in is positive. Direction lives in the sign of
/// the amount and nowhere else, so an amount and its direction cannot disagree.
pub fn flow_of(amount_minor: i64) -> TransactionFlow {
    if amount_minor < 0 {
        TransactionFlow::Debit
    } else {
        TransactionFlow::Credit
    }
}

pub fn signed_amount(magnitude_minor: i64, flow: TransactionFlow) -> i64 {
    match flow {
        TransactionFlow::Debit => -magnitude_minor,
        TransactionFlow::Credit => magnitude_minor,
    }
}

pub fn magnitude_of(amount_minor: i64) -> i64 {
    amount_minor.abs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn direction_lives_in_the_sign() {
        assert_eq!(flow_of(-1), TransactionFlow::Debit);
        assert_eq!(flow_of(0), TransactionFlow::Credit);
        assert_eq!(flow_of(1), TransactionFlow::Credit);
        assert_eq!(signed_amount(4_325, TransactionFlow::Debit), -4_325);
        assert_eq!(magnitude_of(-4_325), 4_325);
    }
}
