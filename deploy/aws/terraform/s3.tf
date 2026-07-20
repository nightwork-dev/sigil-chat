# Mirk artifact object store — the durable home for uploaded documents and
# generated artifacts, so the instance stays disposable. Access is granted via
# an instance profile scoped to exactly this bucket (no static keys on the box;
# amends the earlier no-IAM decision deliberately — a scoped role is the
# credential-less pattern, recorded on DEP.2).

resource "aws_s3_bucket" "artifacts" {
  bucket = var.artifact_bucket_name

  tags = {
    Name      = "sigil-chat-artifacts"
    ManagedBy = "terraform"
    Purpose   = "mirk-artifact-store"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "artifact_access" {
  statement {
    sid       = "ArtifactObjectRW"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/*"]
  }

  statement {
    sid       = "ArtifactList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.artifacts.arn]
  }
}

resource "aws_iam_role" "instance" {
  name_prefix        = "sigil-chat-instance-"
  assume_role_policy = data.aws_iam_policy_document.instance_assume.json

  tags = {
    ManagedBy = "terraform"
  }
}

resource "aws_iam_role_policy" "artifact_access" {
  name_prefix = "artifact-store-"
  role        = aws_iam_role.instance.id
  policy      = data.aws_iam_policy_document.artifact_access.json
}

resource "aws_iam_instance_profile" "instance" {
  name_prefix = "sigil-chat-"
  role        = aws_iam_role.instance.name
}
