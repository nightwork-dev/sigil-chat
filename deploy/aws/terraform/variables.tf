variable "aws_region" {
  description = "AWS region for this disposable deployment."
  type        = string
}

variable "aws_profile" {
  description = "Named AWS CLI profile used by the strategist."
  type        = string
  default     = "sigil-deploy"
}

variable "availability_zone" {
  description = "Availability Zone for the instance, for example us-west-2a."
  type        = string
}

variable "public_host" {
  description = "Public DNS name Caddy will serve."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]*[a-z0-9]$", var.public_host))
    error_message = "public_host must be a lowercase DNS hostname."
  }
}

variable "key_name" {
  description = "Name for the EC2 key pair. Terraform only receives an existing public key."
  type        = string
}

variable "public_key_path" {
  description = "Absolute path to the existing SSH public key for emergency access."
  type        = string
}

variable "admin_cidr" {
  description = "One trusted administrative IPv4 CIDR allowed to SSH to the instance."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_cidr, 0))
    error_message = "admin_cidr must be a valid CIDR, normally a single /32 address."
  }
}

variable "instance_type" {
  description = "Deliberately small x86 instance type for the demo."
  type        = string
  default     = "t3.medium"
}

variable "root_volume_gib" {
  description = "Encrypted gp3 root volume size."
  type        = number
  default     = 40

  validation {
    condition     = var.root_volume_gib >= 30 && var.root_volume_gib <= 100
    error_message = "root_volume_gib must be between 30 and 100."
  }
}

variable "artifact_bucket_name" {
  description = "Globally-unique S3 bucket for the Mirk artifact object store."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.artifact_bucket_name))
    error_message = "artifact_bucket_name must be a valid S3 bucket name."
  }
}

variable "route53_zone_id" {
  description = "Optional existing Route53 hosted-zone ID. Leave null to manage DNS elsewhere."
  type        = string
  default     = null
  nullable    = true
}

variable "route53_record_name" {
  description = "Optional Route53 record name. Required when route53_zone_id is set."
  type        = string
  default     = null
  nullable    = true
}
