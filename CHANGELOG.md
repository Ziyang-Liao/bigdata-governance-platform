# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-21

### Fixed
- **OpenMetadata URL injection** — `OPENMETADATA_URL` is now passed from `OmServiceStack` ALB DNS to `PlatformStack` via CDK cross-stack reference, replacing the broken `process.env` approach that resulted in empty values at deploy time
- **Container health check** — Removed ECS container-level health check (`curl` not available in image), relying on ALB target group health check which correctly validates `/api/v1/system/version`
- **Datasource table browsing crash** — Added error handling in the frontend when the tables API returns an error object instead of an array, preventing `Application error: a client-side exception`
- **RDS auto-discovery credentials** — `discoverRdsInstances` now returns `database` and `masterUserSecretArn` so that selecting an RDS instance auto-fills the database name and uses the correct managed secret for authentication
- **Datasource creation with RDS secret** — POST `/api/datasources` now accepts `rdsSecretArn` to read credentials directly from the RDS managed secret, avoiding password mismatch when users manually enter credentials

### Changed
- **Stack deployment order** — OpenMetadata stacks now deploy before `PlatformStack` to ensure the ALB DNS is available as a cross-stack reference
- **Removed legacy `OpenMetadataStack`** — The monolithic stack conflicted with the split stacks (`OmDatabase`, `OmSearch`, `OmService`); removed from `app.ts`

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

[1.0.1]: https://github.com/Ziyang-Liao/bigdata-governance-platform/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Ziyang-Liao/bigdata-governance-platform/releases/tag/v1.0.0
