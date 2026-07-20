provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }

  filter {
    name   = "root-device-type"
    values = ["ebs"]
  }
}

data "aws_subnet" "default" {
  filter {
    name   = "availability-zone"
    values = [var.availability_zone]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

resource "aws_key_pair" "deploy" {
  key_name   = var.key_name
  public_key = file(var.public_key_path)
}

resource "aws_security_group" "edge" {
  name_prefix = "sigil-chat-edge-"
  description = "Sigil Chat public TLS edge and restricted operator SSH"
  vpc_id      = data.aws_subnet.default.vpc_id

  ingress {
    description = "Restricted emergency SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.admin_cidr]
  }

  ingress {
    description = "HTTP for Caddy certificate issuance and redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS public origin"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Package, image, certificate, and model-provider egress"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name      = "sigil-chat-edge"
    ManagedBy = "terraform"
    Purpose   = "disposable-demo"
  }
}

resource "aws_instance" "sigil_chat" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  availability_zone           = var.availability_zone
  key_name                    = aws_key_pair.deploy.key_name
  subnet_id                   = data.aws_subnet.default.id
  vpc_security_group_ids      = [aws_security_group.edge.id]
  iam_instance_profile        = aws_iam_instance_profile.instance.name
  associate_public_ip_address = false
  user_data                   = file("${path.module}/user-data.sh")
  user_data_replace_on_change = true

  lifecycle {
    # The default subnet assigns a public address before the separately managed
    # EIP is associated. AWS reports that observed value as true; reconciling
    # it would replace the live instance without changing its effective edge.
    ignore_changes = [associate_public_ip_address]
  }

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
    # 2, not 1: containers sit one bridge-hop from IMDS; the instance role's
    # credentials must be reachable from inside the gonk/eve containers.
    http_put_response_hop_limit = 2
  }

  root_block_device {
    encrypted   = true
    volume_type = "gp3"
    volume_size = var.root_volume_gib
    tags = {
      Name      = "sigil-chat-root"
      ManagedBy = "terraform"
    }
  }

  tags = {
    Name      = "sigil-chat"
    ManagedBy = "terraform"
    Purpose   = "disposable-demo"
  }
}

resource "aws_eip" "sigil_chat" {
  domain = "vpc"

  lifecycle {
    precondition {
      condition = (
        var.route53_zone_id == null && var.route53_record_name == null
        ) || (
        var.route53_zone_id != null && var.route53_record_name != null
      )
      error_message = "Set both route53_zone_id and route53_record_name, or neither."
    }
  }

  tags = {
    Name      = "sigil-chat"
    ManagedBy = "terraform"
  }
}

resource "aws_eip_association" "sigil_chat" {
  allocation_id = aws_eip.sigil_chat.id
  instance_id   = aws_instance.sigil_chat.id
}

resource "aws_route53_record" "public" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.route53_record_name
  type    = "A"
  ttl     = 60
  records = [aws_eip.sigil_chat.public_ip]
}
