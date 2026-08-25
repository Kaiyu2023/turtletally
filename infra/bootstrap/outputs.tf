output "state_bucket" {
  description = "The bucket a backend configuration points at. Backend coordinates stay outside source control."
  value       = aws_s3_bucket.state.id
}
