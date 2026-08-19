mock_provider "aws" {}

run "foundation_has_no_changes" {
  command = plan
}
