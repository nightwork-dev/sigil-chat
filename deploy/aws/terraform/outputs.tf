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
