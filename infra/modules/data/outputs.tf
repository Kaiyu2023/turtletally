output "finance_table" {
  value = aws_dynamodb_table.finance.name
}

output "finance_table_arn" {
  value = aws_dynamodb_table.finance.arn
}

output "finance_index_arn" {
  value = "${aws_dynamodb_table.finance.arn}/index/*"
}

output "sessions_table" {
  value = aws_dynamodb_table.sessions.name
}

output "sessions_table_arn" {
  value = aws_dynamodb_table.sessions.arn
}

output "audit_table" {
  value = aws_dynamodb_table.audit.name
}

output "audit_table_arn" {
  value = aws_dynamodb_table.audit.arn
}

output "receipt_bucket" {
  value = aws_s3_bucket.receipts.id
}

output "receipt_bucket_arn" {
  value = aws_s3_bucket.receipts.arn
}

output "data_key_id" {
  value = aws_kms_key.data.key_id
}

output "data_key_arn" {
  value = aws_kms_key.data.arn
}
