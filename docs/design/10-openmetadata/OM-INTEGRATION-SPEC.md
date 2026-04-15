# OpenMetadata 集成设计文档

> 版本: v1.1.0-draft  
> 状态: 待评审  
> 作者: Platform Team  
> 日期: 2026-04-15

---

## 1. 目标

将大数据治理平台的元数据自动同步到 OpenMetadata (v1.12.4)，实现统一的数据资产目录、血缘追踪和数据治理能力。

## 2. 前置条件

| 条件 | 说明 | 验证方式 |
|------|------|---------|
| OpenMetadata 服务可用 | `GET /api/v1/system/version` 返回 200 | 平台启动时健康检查 |
| 环境变量 `OPENMETADATA_URL` | 指向 OM 内部 ALB 地址 | CDK 部署时设置 |
| OM 管理员账号 | `admin@open-metadata.org` / `admin` (basic auth) | 首次登录获取 JWT |
| 平台 ECS 与 OM ALB 网络互通 | 同 VPC 内部通信 | SG 规则已配置 |

## 3. OpenMetadata 数据模型

### 3.1 层级结构

```
DatabaseService (连接配置)
  └── Database (数据库)
        └── DatabaseSchema (Schema/命名空间)
              └── Table (表)
                    └── Column[] (列定义)

PipelineService (管道服务)
  └── Pipeline (管道/任务)
        └── Task[] (任务步骤)

Lineage (血缘)
  └── Edge (fromEntity → toEntity)
        └── ColumnLineage[] (列级映射)
```

### 3.2 FQN (Fully Qualified Name) 命名规范

FQN 是 OM 中实体的唯一标识符，格式为层级路径用 `.` 连接。

| 实体类型 | FQN 格式 | 示例 |
|---------|---------|------|
| DatabaseService | `{serviceName}` | `bgp-mysql-3M7QX` |
| Database | `{serviceName}.{dbName}` | `bgp-mysql-3M7QX.ecommerce` |
| DatabaseSchema | `{serviceName}.{dbName}.{schemaName}` | `bgp-mysql-3M7QX.ecommerce.default` |
| Table | `{serviceName}.{dbName}.{schemaName}.{tableName}` | `bgp-mysql-3M7QX.ecommerce.default.customers` |
| PipelineService | `{serviceName}` | `bgp-sync` |
| Pipeline | `{serviceName}.{pipelineName}` | `bgp-sync.test-redshift` |

**命名规则：**
- `serviceName` = `bgp-{dbType}-{datasourceId后5位}`，确保唯一且可读
- MySQL 没有 schema 概念，OM 自动创建 `default` schema
- PostgreSQL 使用实际 schema 名
- Redshift 使用 `{workgroupName}` 作为 service name

## 4. API 调用规格

### 4.1 认证

```
POST /api/v1/users/login
Content-Type: application/json

Request:
{
  "email": "admin@open-metadata.org",
  "password": "YWRtaW4="              // base64("admin")
}

Response:
{
  "accessToken": "eyJhbGci...",       // JWT, 有效期 24h
  "tokenType": "Bearer",
  "expiryDuration": 86400
}
```

**注意事项：**
- password 必须 base64 编码
- Token 缓存在内存，过期前 5 分钟自动刷新
- 所有后续请求 Header: `Authorization: Bearer {accessToken}`

### 4.2 创建/更新 Database Service

```
PUT /api/v1/services/databaseServices
Content-Type: application/json

Request:
{
  "name": "bgp-mysql-3M7QX",                    // 必填，唯一标识
  "serviceType": "Mysql",                         // 必填，枚举值见下表
  "description": "MySQL数据源 - ecommerce",       // 可选
  "connection": {
    "config": {
      "type": "Mysql",                            // 必须与 serviceType 一致
      "scheme": "mysql+pymysql",                  // 连接协议
      "hostPort": "bgp-source-mysql.xxx:3306",    // host:port
      "username": "admin",                        // 用户名
      "authType": {
        "password": "***"                         // 密码（OM 内部加密存储）
      },
      "databaseName": "ecommerce"                 // 默认数据库
    }
  }
}

Response: 201/200
{
  "id": "uuid",
  "name": "bgp-mysql-3M7QX",
  "fullyQualifiedName": "bgp-mysql-3M7QX",
  "serviceType": "Mysql",
  ...
}
```

**serviceType 枚举值映射：**

| 平台 type | OM serviceType | OM connection type | scheme |
|-----------|---------------|-------------------|--------|
| mysql | Mysql | Mysql | mysql+pymysql |
| postgresql | Postgres | Postgres | postgresql+psycopg2 |
| oracle | Oracle | Oracle | oracle+cx_oracle |
| sqlserver | Mssql | Mssql | mssql+pytds |

**注意事项：**
- PUT 是 upsert 操作，name 相同则更新
- connection.config.password 不要传明文，OM 会加密存储
- 如果数据源密码在 Secrets Manager 中，传 placeholder 即可（OM 不需要真正连接）

### 4.3 创建/更新 Database

```
PUT /api/v1/databases
Content-Type: application/json

Request:
{
  "name": "ecommerce",                           // 必填
  "service": "bgp-mysql-3M7QX",                  // 必填，关联的 service FQN
  "description": "电商业务数据库"                   // 可选
}

Response: 201/200
{
  "id": "uuid",
  "name": "ecommerce",
  "fullyQualifiedName": "bgp-mysql-3M7QX.ecommerce",
  "service": { "id": "...", "name": "bgp-mysql-3M7QX", ... }
}
```

### 4.4 创建/更新 Database Schema

```
PUT /api/v1/databaseSchemas
Content-Type: application/json

Request:
{
  "name": "default",                              // MySQL 用 "default"
  "database": "bgp-mysql-3M7QX.ecommerce"        // 必填，关联的 database FQN
}
```

**注意事项：**
- MySQL 没有 schema 概念，统一用 `default`
- PostgreSQL 用实际 schema 名（如 `public`）
- Redshift 用实际 schema 名（如 `public`）

### 4.5 创建/更新 Table

```
PUT /api/v1/tables
Content-Type: application/json

Request:
{
  "name": "customers",                            // 必填
  "databaseSchema": "bgp-mysql-3M7QX.ecommerce.default",  // 必填，schema FQN
  "tableType": "Regular",                         // Regular | View | External
  "description": "客户信息表",                     // 可选
  "columns": [                                    // 必填，至少一列
    {
      "name": "id",
      "dataType": "INT",                          // OM 标准数据类型
      "dataTypeDisplay": "int",                   // 原始类型显示
      "description": "主键",
      "constraint": "PRIMARY_KEY",                // 可选: PRIMARY_KEY | UNIQUE | NOT_NULL
      "ordinalPosition": 1
    },
    {
      "name": "name",
      "dataType": "VARCHAR",
      "dataLength": 100,
      "dataTypeDisplay": "varchar(100)",
      "ordinalPosition": 2
    },
    {
      "name": "created_at",
      "dataType": "TIMESTAMP",
      "dataTypeDisplay": "timestamp",
      "ordinalPosition": 3
    }
  ]
}
```

**OM dataType 枚举值映射：**

| MySQL 类型 | OM dataType | 备注 |
|-----------|-------------|------|
| int / integer | INT | |
| bigint | BIGINT | |
| smallint / tinyint | SMALLINT | |
| float | FLOAT | |
| double | DOUBLE | |
| decimal(p,s) | DECIMAL | 需设 dataLength=p |
| varchar(n) | VARCHAR | 需设 dataLength=n |
| char(n) | CHAR | 需设 dataLength=n |
| text | TEXT | |
| date | DATE | |
| datetime / timestamp | TIMESTAMP | |
| boolean / tinyint(1) | BOOLEAN | |
| json | JSON | |
| blob / binary | BINARY | |

### 4.6 创建/更新 Pipeline Service

```
PUT /api/v1/services/pipelineServices
Content-Type: application/json

Request:
{
  "name": "bgp-sync",                            // 同步任务统一用 bgp-sync
  "serviceType": "CustomPipeline",                // 同步任务用 CustomPipeline
  "connection": {
    "config": {
      "type": "CustomPipeline",
      "sourcePythonClass": "bgp.sync.GlueETL"    // 标识来源
    }
  }
}
```

**Pipeline Service 类型：**

| 平台模块 | OM serviceType | service name |
|---------|---------------|-------------|
| 数据同步 | CustomPipeline | bgp-sync |
| ETL 编排 | Airflow | bgp-mwaa |

### 4.7 创建/更新 Pipeline

```
PUT /api/v1/pipelines
Content-Type: application/json

Request:
{
  "name": "test-redshift",                        // 任务名
  "service": "bgp-sync",                          // 关联的 pipeline service FQN
  "description": "MySQL → Redshift 全量同步",
  "tasks": [                                      // 任务步骤
    {
      "name": "sync_customers",
      "description": "同步 customers 表",
      "taskType": "sync"
    },
    {
      "name": "sync_orders",
      "description": "同步 orders 表",
      "taskType": "sync",
      "downstreamTasks": ["sync_customers"]        // 依赖关系
    }
  ],
  "scheduleInterval": "*/3 * * * *"               // cron 表达式（可选）
}
```

### 4.8 添加血缘 (Lineage)

```
PUT /api/v1/lineage
Content-Type: application/json

Request:
{
  "edge": {
    "fromEntity": {
      "id": "uuid-of-source-table",               // 源表 UUID
      "type": "table"
    },
    "toEntity": {
      "id": "uuid-of-target-table",               // 目标表 UUID
      "type": "table"
    },
    "lineageDetails": {
      "pipeline": {
        "id": "uuid-of-pipeline",                  // 关联的 pipeline UUID
        "type": "pipeline"
      },
      "columnsLineage": [                          // 列级血缘
        {
          "fromColumns": ["bgp-mysql-3M7QX.ecommerce.default.customers.id"],
          "toColumn": "bgp-redshift-dev.dev.public.customers.id"
        },
        {
          "fromColumns": ["bgp-mysql-3M7QX.ecommerce.default.customers.name"],
          "toColumn": "bgp-redshift-dev.dev.public.customers.name"
        }
      ]
    }
  }
}
```

**注意事项：**
- `fromEntity.id` 和 `toEntity.id` 需要先通过 `GET /api/v1/tables/name/{fqn}` 获取 UUID
- `columnsLineage.fromColumns` 是数组（支持多列合并为一列的场景）
- `columnsLineage.toColumn` 是单个列的 FQN
- 血缘是追加式的，重复添加同一条边不会报错

## 5. 核心逻辑设计

### 5.1 OmClient 模块

```
文件: platform/src/lib/openmetadata/om-client.ts

职责: 封装 OM API 调用，管理认证，处理错误

状态管理:
  - token: string | null          // JWT token
  - tokenExpiry: number           // 过期时间戳
  - baseUrl: string               // OM 内部 URL

核心方法:
  - getToken(): Promise<string>   // 获取有效 token（自动刷新）
  - request(method, path, body): Promise<any>  // 通用请求方法
  - getEntityByName(type, fqn): Promise<any>   // 按 FQN 查询实体

错误处理:
  - OM 不可用 → 静默跳过，记录 console.warn
  - 401 → 自动刷新 token 重试一次
  - 409 (Conflict) → 视为成功（upsert 语义）
  - 其他错误 → 记录日志，不抛出异常
```

### 5.2 推送流程

#### 5.2.1 数据源创建流程

```
用户创建数据源 (POST /api/datasources)
  │
  ├── 1. 保存到 DynamoDB ✅
  │
  └── 2. 异步推送到 OM (不阻塞主流程)
        ├── PUT /api/v1/services/databaseServices  → 创建 Service
        └── PUT /api/v1/databases                   → 创建 Database
```

#### 5.2.2 表结构发现流程

```
用户浏览表结构 (GET /api/datasources/{id}/tables)
  │
  ├── 1. 从源数据库查询表结构 ✅
  ├── 2. 返回给前端 ✅
  │
  └── 3. 异步推送到 OM
        ├── PUT /api/v1/databaseSchemas             → 创建 Schema
        └── 对每张表:
              └── PUT /api/v1/tables                → 创建 Table + Columns
```

#### 5.2.3 同步任务血缘流程

```
同步任务执行完成 (pollGlueJob callback)
  │
  ├── 1. 更新 DynamoDB 运行记录 ✅
  │
  └── 2. 异步推送到 OM
        ├── 确保目标表存在 (Redshift/S3 Tables)
        │     ├── PUT /api/v1/services/databaseServices  → Redshift Service
        │     ├── PUT /api/v1/databases                   → dev database
        │     ├── PUT /api/v1/databaseSchemas             → public schema
        │     └── PUT /api/v1/tables                      → 目标表
        │
        ├── 确保 Pipeline 存在
        │     ├── PUT /api/v1/services/pipelineServices   → bgp-sync
        │     └── PUT /api/v1/pipelines                   → 同步任务
        │
        └── 添加血缘
              └── PUT /api/v1/lineage                     → 表级 + 列级
```

#### 5.2.4 ETL 编排发布流程

```
用户发布 DAG (POST /api/workflow/{id}/publish)
  │
  ├── 1. 生成 DAG 文件上传 S3 ✅
  │
  └── 2. 异步推送到 OM
        ├── PUT /api/v1/services/pipelineServices   → bgp-mwaa
        └── PUT /api/v1/pipelines                   → 编排任务 (含 tasks + 依赖)
```

### 5.3 幂等性保证

所有推送使用 PUT (upsert) 语义：
- 实体不存在 → 创建（201）
- 实体已存在且 name 相同 → 更新（200）
- 不需要先查询再决定创建还是更新

### 5.4 性能考虑

- 所有 OM 推送异步执行（`Promise.catch(() => {})`）
- 批量表推送使用 `Promise.all` 并发（最多 10 个并发）
- Token 缓存避免重复登录
- 推送失败不重试（下次操作时会再次推送）

## 6. 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `platform/src/lib/openmetadata/om-client.ts` | 新建 | OM API 客户端（认证、请求、错误处理） |
| `platform/src/lib/openmetadata/om-datasource.ts` | 新建 | 数据源 → OM 推送逻辑 |
| `platform/src/lib/openmetadata/om-sync.ts` | 新建 | 同步任务 → OM 推送逻辑（Pipeline + Lineage） |
| `platform/src/lib/openmetadata/om-workflow.ts` | 新建 | ETL 编排 → OM 推送逻辑 |
| `platform/src/app/api/datasources/route.ts` | 修改 | POST hook: 推送 Service + Database |
| `platform/src/app/api/datasources/[id]/tables/route.ts` | 修改 | GET hook: 推送 Schema + Tables |
| `platform/src/app/api/sync/route.ts` | 修改 | POST hook: 推送 Pipeline |
| `platform/src/app/api/sync/[id]/start/route.ts` | 修改 | 完成 hook: 推送 Lineage |
| `platform/src/app/api/workflow/[id]/publish/route.ts` | 修改 | POST hook: 推送 Pipeline |

## 7. 测试验证

| 场景 | 验证方法 | 预期结果 |
|------|---------|---------|
| 创建 MySQL 数据源 | OM UI 查看 Database Services | 出现 bgp-mysql-xxx 服务 |
| 浏览表结构 | OM UI 搜索表名 | 表和列信息完整 |
| 执行同步任务 | OM UI 查看 Lineage | 源表→目标表有连线，列级映射正确 |
| 发布 ETL 编排 | OM UI 查看 Pipelines | 出现编排任务，含 tasks |
| OM 不可用 | 关闭 OM 后操作平台 | 平台功能正常，无报错 |
| 重复推送 | 多次创建同名数据源 | OM 中只有一条记录（upsert） |

## 8. 风险与限制

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OM 服务不可用 | 元数据不同步 | 静默跳过，下次操作时补推 |
| OM 容器重启 IP 变化 | 公共 ALB target 失效 | 需将公共 ALB 纳入 CDK 自动管理 |
| 大量表同时推送 | OM API 压力 | 并发限制 10，失败不重试 |
| 密码传递 | OM 存储数据源密码 | 传 placeholder，OM 不需要真正连接 |
| FQN 命名冲突 | 不同数据源同名表 | service name 包含 datasourceId 确保唯一 |

## 9. 不在范围内

- OM Ingestion Pipeline 配置（平台主动推送，不用 OM 爬取）
- OM 直连数据库（避免网络和权限复杂度）
- 双向同步（OM 只读，平台是唯一写入方）
- OM 用户/权限管理（使用 OM 默认 admin）
- Data Quality 规则推送（后续版本）
