terraform {
  required_version = "= 1.15.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "= 6.61.0"
    }
  }

  # ADR 0006: coordinates come from an ignored partial configuration, and a
  # stage is a distinct key rather than a workspace.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project = "turtle-tally"
      Stage   = var.stage
    }
  }
}
