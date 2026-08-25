# ADR 0003 and ADR 0010 fix the model and the keys; this module only creates the
# tables that hold them. Capacity is provisioned rather than on demand because
# ADR 0007 sizes every read against a small reserve.

# One customer-managed key for everything this stack stores: the tables, the
# receipts, and the refresh token inside a session record. One key is one thing
# to rotate, one thing to audit, and one thing whose loss is recoverable from a
# documented drill.
resource "aws_kms_key" "data" {
  description             = "Encrypts the ledger, its objects, and the refresh token inside a session record."
  enable_key_rotation     = true
  deletion_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "data" {
  name          = "alias/${var.name_prefix}-data"
  target_key_id = aws_kms_key.data.key_id
}

resource "aws_dynamodb_table" "finance" {
  name         = "${var.name_prefix}-finance"
  billing_mode = "PROVISIONED"

  read_capacity  = var.finance_read_capacity
  write_capacity = var.finance_write_capacity

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # Sparse: only a ledger row carries these, so the index resolves a transaction
  # by identifier without knowing which month partition holds it (ADR 0010).
  global_secondary_index {
    name            = "TransactionById"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
    read_capacity   = 1
    write_capacity  = var.finance_write_capacity
  }

  # Upload grants and assistant proposals expire on their own.
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_dynamodb_table" "sessions" {
  name         = "${var.name_prefix}-sessions"
  billing_mode = "PROVISIONED"

  read_capacity  = 2
  write_capacity = 2

  hash_key = "PK"

  attribute {
    name = "PK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  deletion_protection_enabled = true
}

# Append-only and server-internal (ADR 0003). No endpoint reads it, so its
# recovery is an operational concern rather than a feature.
resource "aws_dynamodb_table" "audit" {
  name         = "${var.name_prefix}-audit"
  billing_mode = "PROVISIONED"

  read_capacity  = 1
  write_capacity = 2

  hash_key  = "PK"
  range_key = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.data.arn
  }

  deletion_protection_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket" "receipts" {
  bucket = "${var.name_prefix}-receipts"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
    bucket_key_enabled = true
  }
}

data "aws_iam_policy_document" "receipts" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.receipts.arn,
      "${aws_s3_bucket.receipts.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "receipts" {
  bucket = aws_s3_bucket.receipts.id
  policy = data.aws_iam_policy_document.receipts.json
}

# A receipt is reached only through a short-lived grant, so no origin is
# permitted to read it from a page.
resource "aws_s3_bucket_cors_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id

  cors_rule {
    allowed_methods = ["PUT"]
    allowed_origins = var.upload_origins
    allowed_headers = ["content-type"]
    max_age_seconds = 300
  }
}
