# A module follows whatever the root it is used from pins, within the major line
# it was written against. The exact pin lives in the roots, and the committed
# lockfile is what a check actually resolves.
terraform {
  required_version = "= 1.15.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.61"
    }
  }
}
