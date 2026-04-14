# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-14

### Added
- **Data Source Management** — Connect MySQL, PostgreSQL, Oracle, SQL Server with auto-discovery, Glue Connection, Secrets Manager integration
- **Data Sync** — Glue ETL pipelines syncing data to S3 Tables (Iceberg) and Redshift Serverless, with type mapping and field-level configuration
- **ETL Workflow Orchestration** — Visual DAG editor (ReactFlow), publish to MWAA (Airflow), sync/SQL/Python node types
- **Schedule Management** — MWAA native cron scheduling, auto-unpause, cron editor UI
- **Task Monitoring** — Run instance timeline, per-run logs from CloudWatch, retry failed tasks, server-side search/filter
- **Data Governance** — Data catalog, table/column-level lineage visualization, OpenMetadata v1.12.4 integration
- **Redshift Query Editor** — SQL execution, schema browser, query history
- **User Management** — Cognito-based authentication with role groups
- **Infrastructure as Code** — Full CDK deployment (11 stacks), all resources automated
- **OpenMetadata** — Separate CDK stacks (Database/Search/Service) for isolation

### Infrastructure
- VPC with public/private subnets, NAT Gateway
- ECS Fargate (platform + OpenMetadata)
- CloudFront CDN with ALB origin
- RDS MySQL (source DB + OpenMetadata backend)
- Redshift Serverless
- DynamoDB (metadata store)
- MWAA (Managed Airflow)
- OpenSearch (OpenMetadata search)
- S3 (data lake, Glue scripts, MWAA DAGs)
- Cognito User Pool
- All passwords via Secrets Manager

[1.0.0]: https://github.com/Ziyang-Liao/bigdata-governance-platform/releases/tag/v1.0.0
