output "distribution_arn" {
  value = aws_cloudfront_distribution.browser.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.browser.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.browser.domain_name
}

output "site_bucket" {
  value = aws_s3_bucket.site.id
}
