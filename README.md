# BigData Governance Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CDK](https://img.shields.io/badge/AWS%20CDK-v2-orange)](https://aws.amazon.com/cdk/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![OpenMetadata](https://img.shields.io/badge/OpenMetadata-1.12.4-blue)](https://open-metadata.org/)

A unified big data governance platform built on AWS, providing end-to-end data management capabilities including data source connectivity, ETL orchestration, scheduling, monitoring, and data governance.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CloudFront CDN                        │
├─────────────────────────────────────────────────────────┤
│              Application Load Balancer                   │
├─────────────────────────────────────────────────────────┤
│          ECS Fargate (Next.js Platform)                  │
├──────────┬──────────┬───────────┬───────────┬───────────┤
│ DynamoDB │ Redshift │   MWAA    │   Glue    │    S3     │
│          │Serverless│ (Airflow) │   ETL     │  Tables   │
├──────────┴──────────┴───────────┴───────────┴───────────┤
│  RDS MySQL │ OpenSearch │ Cognito │ Secrets Manager      │
├─────────────────────────────────────────────────────────┤
│              OpenMetadata (ECS Fargate)                   │
└─────────────────────────────────────────────────────────┘
```

## Features

| Module | Description |
|--------|-------------|
| **Data Sources** | Connect MySQL, PostgreSQL, Oracle, SQL Server with auto-discovery, Glue Connection, and Secrets Manager |
| **Data Sync** | Glue ETL pipelines → S3 Tables (Iceberg) / Redshift, with type mapping and field configuration |
| **ETL Orchestration** | Visual DAG editor, publish to MWAA (Airflow), sync/SQL/Python nodes |
| **Scheduling** | MWAA native cron, auto-unpause, visual cron editor |
| **Monitoring** | Run timeline, per-run CloudWatch logs, retry, server-side search |
| **Data Governance** | Catalog, lineage visualization, OpenMetadata v1.12.4 integration |
| **Redshift Query** | SQL editor, schema browser, query history |
| **User Management** | Cognito authentication with RBAC groups |

## Prerequisites

- AWS Account with administrator access
- AWS CLI configured
- Node.js >= 18
- Docker (for ECS image builds)

## Quick Start

```bash
# Clone
git clone https://github.com/Ziyang-Liao/bigdata-governance-platform.git
cd bigdata-governance-platform

# Install dependencies
cd infra && npm install
cd ../platform && npm install
cd ..

# Bootstrap CDK (first time only)
cd infra
npx cdk bootstrap

# Deploy all stacks
npx cdk deploy --all --require-approval never
```

## CDK Stacks

| Stack | Resources | Deploy Time |
|-------|-----------|-------------|
| `BgpVpcStack` | VPC, Subnets, NAT Gateway | ~3 min |
| `BgpDatabaseStack` | DynamoDB tables | ~1 min |
| `BgpAuthStack` | Cognito User Pool | ~1 min |
| `BgpRdsStack` | MySQL RDS instance | ~8 min |
| `BgpRedshiftStack` | Redshift Serverless | ~2 min |
| `BgpPlatformStack` | ECS, ALB, CloudFront, S3, Glue Role | ~5 min |
| `BgpMwaaStack` | MWAA (Airflow) environment | ~30 min |
| `BgpOmDatabaseStack` | OpenMetadata MySQL | ~8 min |
| `BgpOmSearchStack` | OpenMetadata OpenSearch | ~12 min |
| `BgpOmServiceStack` | OpenMetadata ECS + ALB | ~5 min |

> **Note:** OpenMetadata requires pushing the Docker image to ECR before deploying `BgpOmServiceStack`. See [OpenMetadata Setup](#openmetadata-setup).

## Project Structure

```
├── infra/                    # AWS CDK Infrastructure
│   ├── bin/app.ts           # CDK app entry point
│   └── lib/
│       ├── vpc-stack.ts     # VPC networking
│       ├── database-stack.ts # DynamoDB tables
│       ├── auth-stack.ts    # Cognito authentication
│       ├── rds-stack.ts     # Source MySQL database
│       ├── redshift-stack.ts # Redshift Serverless
│       ├── platform-stack.ts # Main platform (ECS + CloudFront)
│       ├── mwaa-stack.ts    # MWAA (Airflow)
│       ├── om-database-stack.ts  # OpenMetadata DB
│       ├── om-search-stack.ts    # OpenMetadata Search
│       └── om-service-stack.ts   # OpenMetadata Service
├── platform/                 # Next.js 14 Application
│   └── src/
│       ├── app/             # Pages and API routes
│       ├── components/      # Reusable UI components
│       ├── lib/             # Business logic and AWS services
│       └── types/           # TypeScript type definitions
└── docs/                    # Design documents
```

## Configuration

All configuration is through environment variables, set automatically by CDK:

| Variable | Description | Set By |
|----------|-------------|--------|
| `AWS_REGION` | AWS region | CDK |
| `AWS_ACCOUNT_ID` | AWS account ID | CDK |
| `COGNITO_USER_POOL_ID` | Cognito pool ID | CDK |
| `REDSHIFT_WORKGROUP` | Redshift workgroup name | CDK |
| `MWAA_ENV_NAME` | MWAA environment name | CDK |
| `MWAA_DAG_BUCKET` | S3 bucket for DAGs | CDK |
| `GLUE_ROLE_ARN` | Glue execution role | CDK |
| `GLUE_SCRIPTS_BUCKET` | S3 bucket for Glue scripts | CDK |
| `OPENMETADATA_URL` | Internal OM URL | Manual (post-deploy) |
| `OPENMETADATA_PUBLIC_URL` | Public OM URL | Manual (post-deploy) |

## OpenMetadata Setup

OpenMetadata requires a Docker image in ECR:

```bash
# Create ECR repository
aws ecr create-repository --repository-name openmetadata-server

# Pull, tag, and push
aws ecr get-login-password | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com
docker pull docker.getcollate.io/openmetadata/server:1.12.4
docker tag docker.getcollate.io/openmetadata/server:1.12.4 <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/openmetadata-server:1.12.4
docker push <ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/openmetadata-server:1.12.4

# Deploy OpenMetadata stacks
cd infra
npx cdk deploy BgpOmDatabaseStack BgpOmSearchStack --require-approval never
npx cdk deploy BgpOmServiceStack --require-approval never
```

Default login: `admin@open-metadata.org` / `admin`

## Security

- All database passwords generated via AWS Secrets Manager
- CloudFront + ALB with prefix list restriction
- Private subnets for all backend services
- Cognito-based authentication
- No hardcoded credentials in source code

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
