mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name_prefix       = "turtle-tally-test"
  domain_name       = "app.example.invalid"
  certificate_arn   = "arn:aws:acm:us-east-1:000000000000:certificate/example"
  api_origin_domain = "example.lambda-url.eu-west-2.on.aws"
}

run "the_application_and_its_api_share_one_origin_over_tls_only" {
  command = plan

  assert {
    condition = alltrue([
      for behaviour in aws_cloudfront_distribution.browser.ordered_cache_behavior :
      behaviour.viewer_protocol_policy == "https-only" && behaviour.target_origin_id == "api"
    ])
    error_message = "Session and API paths reach the function over TLS only."
  }

  assert {
    condition = length([
      for behaviour in aws_cloudfront_distribution.browser.ordered_cache_behavior :
      behaviour if behaviour.path_pattern == "/auth/*"
    ]) == 1
    error_message = "The sign-in routes must be served by the function, not the bucket."
  }

  assert {
    condition     = aws_cloudfront_distribution.browser.viewer_certificate[0].minimum_protocol_version == "TLSv1.2_2021"
    error_message = "The distribution must not negotiate an outdated protocol."
  }

  assert {
    condition     = aws_cloudfront_distribution.browser.default_cache_behavior[0].viewer_protocol_policy == "redirect-to-https"
    error_message = "A plain request is redirected rather than served."
  }
}

run "the_built_application_is_private_and_reached_only_through_the_distribution" {
  command = plan

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.site.block_public_acls,
      aws_s3_bucket_public_access_block.site.block_public_policy,
      aws_s3_bucket_public_access_block.site.ignore_public_acls,
      aws_s3_bucket_public_access_block.site.restrict_public_buckets,
    ])
    error_message = "The bucket behind the distribution is not itself a website."
  }

  assert {
    condition     = aws_cloudfront_origin_access_control.site.signing_behavior == "always"
    error_message = "Every origin request is signed."
  }
}

run "the_browser_is_told_what_it_may_load" {
  command = plan

  assert {
    condition = can(regex(
      "frame-ancestors 'none'",
      aws_cloudfront_response_headers_policy.browser.security_headers_config[0].content_security_policy[0].content_security_policy
    ))
    error_message = "The application must not be framed."
  }

  assert {
    condition = can(regex(
      "default-src 'self'",
      aws_cloudfront_response_headers_policy.browser.security_headers_config[0].content_security_policy[0].content_security_policy
    ))
    error_message = "Only this origin's own resources may load."
  }

  assert {
    condition     = aws_cloudfront_response_headers_policy.browser.security_headers_config[0].strict_transport_security[0].access_control_max_age_sec >= 31536000
    error_message = "Transport security is remembered for at least a year."
  }
}
