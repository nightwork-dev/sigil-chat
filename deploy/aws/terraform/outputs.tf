output "elastic_ip" {
  description = "Public IPv4 address for DNS and external verification."
  value       = aws_eip.sigil_chat.public_ip
}

output "instance_id" {
  description = "EC2 instance ID used for teardown verification."
  value       = aws_instance.sigil_chat.id
}

output "public_origin" {
  description = "Expected public origin after DNS propagation and Caddy issuance."
  value       = "https://${var.public_host}"
}

output "artifact_bucket_name" {
  description = "Private versioned bucket used for release manifests."
  value       = aws_s3_bucket.artifacts.bucket
}

output "github_release_role_arn" {
  description = "OIDC role assumed by the protected GitHub production environment."
  value       = aws_iam_role.github_release.arn
}

output "ecr_registry" {
  description = "Private ECR registry containing immutable release images."
  value       = split("/", aws_ecr_repository.release["web"].repository_url)[0]
}

output "ssm_deploy_document" {
  description = "SSM document used to deploy or roll back an immutable manifest."
  value       = aws_ssm_document.deploy_release.name
}
