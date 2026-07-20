locals {
  release_image_targets = toset(["eve", "gonk", "migrate", "web"])
}

resource "aws_ecr_repository" "release" {
  for_each = local.release_image_targets

  name                 = "sigil-chat-${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = "sigil-chat-${each.key}"
    ManagedBy = "terraform"
    Purpose   = "production-release"
  }
}

resource "aws_ecr_lifecycle_policy" "release" {
  for_each   = aws_ecr_repository.release
  repository = each.value.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the newest twenty release images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_ecr_repository" "build_cache" {
  name                 = "sigil-chat-build-cache"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = false
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name      = "sigil-chat-build-cache"
    ManagedBy = "terraform"
    Purpose   = "ephemeral-build-cache"
  }
}

resource "aws_ecr_lifecycle_policy" "build_cache" {
  repository = aws_ecr_repository.build_cache.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire build caches after fourteen days"
      selection = {
        tagStatus   = "any"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = {
    ManagedBy = "terraform"
  }
}

data "aws_iam_policy_document" "github_release_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${split("/", var.github_repository)[0]}@${var.github_owner_id}/${split("/", var.github_repository)[1]}@${var.github_repository_id}:environment:${var.github_environment}",
      ]
    }
  }
}

data "aws_iam_policy_document" "github_release" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PushReleaseImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = concat(
      [for repository in aws_ecr_repository.release : repository.arn],
      [aws_ecr_repository.build_cache.arn],
    )
  }

  statement {
    sid       = "PublishReleaseManifest"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.artifacts.arn}/releases/*"]
  }

  statement {
    sid     = "DeployRelease"
    actions = ["ssm:SendCommand"]
    resources = [
      aws_instance.sigil_chat.arn,
      aws_ssm_document.deploy_release.arn,
    ]
  }

  statement {
    sid = "ReadDeploymentResult"
    actions = [
      "ssm:GetCommandInvocation",
      "ssm:ListCommandInvocations",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role" "github_release" {
  name_prefix        = "sigil-chat-github-release-"
  assume_role_policy = data.aws_iam_policy_document.github_release_assume.json

  tags = {
    ManagedBy = "terraform"
    Purpose   = "github-production-release"
  }
}

resource "aws_iam_role_policy" "github_release" {
  name_prefix = "release-"
  role        = aws_iam_role.github_release.id
  policy      = data.aws_iam_policy_document.github_release.json
}

data "aws_iam_policy_document" "instance_release_access" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PullReleaseImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = [for repository in aws_ecr_repository.release : repository.arn]
  }
}

resource "aws_iam_role_policy" "instance_release_access" {
  name_prefix = "release-images-"
  role        = aws_iam_role.instance.id
  policy      = data.aws_iam_policy_document.instance_release_access.json
}

resource "aws_iam_role_policy_attachment" "instance_ssm" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_ssm_document" "deploy_release" {
  name            = "sigil-chat-deploy-release"
  document_type   = "Command"
  document_format = "YAML"

  content = <<-YAML
    schemaVersion: '2.2'
    description: Deploy an immutable Sigil Chat release manifest from private S3.
    parameters:
      ReleaseSha:
        type: String
        description: Full commit SHA identifying the versioned release manifest.
        allowedPattern: '^[a-f0-9]{40}$'
    mainSteps:
      - action: aws:runShellScript
        name: prepareReleaseDirectory
        inputs:
          runCommand:
            - 'install -d -m 0700 "/opt/sigil-chat/releases/{{ ReleaseSha }}"'
      - action: aws:downloadContent
        name: downloadManifest
        inputs:
          sourceType: S3
          sourceInfo: '{"path":"https://s3.${var.aws_region}.amazonaws.com/${aws_s3_bucket.artifacts.bucket}/releases/{{ ReleaseSha }}/sigil-images.env"}'
          destinationPath: '/opt/sigil-chat/releases/{{ ReleaseSha }}'
      - action: aws:runShellScript
        name: deployRelease
        inputs:
          timeoutSeconds: '900'
          runCommand:
            - 'set -eu'
            - '/opt/sigil-chat/deploy/update-images.sh "/opt/sigil-chat/releases/{{ ReleaseSha }}/sigil-images.env"'
  YAML

  tags = {
    ManagedBy = "terraform"
    Purpose   = "production-release"
  }
}
