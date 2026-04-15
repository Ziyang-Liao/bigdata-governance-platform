import { omRequest } from "./om-client";
import type { DataSource } from "@/types/datasource";

const SERVICE_TYPE_MAP: Record<string, { serviceType: string; type: string; scheme: string }> = {
  mysql: { serviceType: "Mysql", type: "Mysql", scheme: "mysql+pymysql" },
  postgresql: { serviceType: "Postgres", type: "Postgres", scheme: "postgresql+psycopg2" },
  oracle: { serviceType: "Oracle", type: "Oracle", scheme: "oracle+cx_oracle" },
  sqlserver: { serviceType: "Mssql", type: "Mssql", scheme: "mssql+pytds" },
};

const OM_DATA_TYPE: Record<string, string> = {
  int: "INT", integer: "INT", bigint: "BIGINT", smallint: "SMALLINT", tinyint: "SMALLINT", mediumint: "INT",
  float: "FLOAT", double: "DOUBLE", decimal: "DECIMAL", numeric: "DECIMAL",
  varchar: "VARCHAR", char: "CHAR", text: "TEXT", tinytext: "TEXT", mediumtext: "TEXT", longtext: "TEXT",
  date: "DATE", datetime: "TIMESTAMP", timestamp: "TIMESTAMP", time: "VARCHAR",
  boolean: "BOOLEAN", "tinyint(1)": "BOOLEAN",
  json: "JSON", blob: "BINARY", binary: "BINARY", enum: "VARCHAR", set: "VARCHAR",
};

function serviceName(ds: DataSource): string {
  return `bgp-${ds.type}-${ds.datasourceId.slice(-5)}`;
}

function schemaName(ds: DataSource): string {
  return ds.type === "mysql" ? "default" : "public";
}

export async function pushDatasource(ds: DataSource) {
  const mapping = SERVICE_TYPE_MAP[ds.type];
  if (!mapping) return;
  const svcName = serviceName(ds);

  await omRequest("PUT", "/api/v1/services/databaseServices", {
    name: svcName,
    serviceType: mapping.serviceType,
    description: `${ds.name} (${ds.type})`,
    connection: {
      config: {
        type: mapping.type,
        scheme: mapping.scheme,
        hostPort: `${ds.host}:${ds.port}`,
        username: ds.username || "admin",
        authType: { password: "managed-by-platform" },
        databaseName: ds.database,
      },
    },
  });

  await omRequest("PUT", "/api/v1/databases", {
    name: ds.database,
    service: svcName,
    description: `Database ${ds.database} on ${ds.name}`,
  });

  await omRequest("PUT", "/api/v1/databaseSchemas", {
    name: schemaName(ds),
    database: `${svcName}.${ds.database}`,
  });
}

export async function pushTables(ds: DataSource, tables: { name: string; columns?: { name: string; type: string }[] }[]) {
  const svcName = serviceName(ds);
  const schema = schemaName(ds);
  const schemaFqn = `${svcName}.${ds.database}.${schema}`;

  const batch = tables.map((t) =>
    omRequest("PUT", "/api/v1/tables", {
      name: t.name,
      databaseSchema: schemaFqn,
      tableType: "Regular",
      columns: (t.columns || []).map((c, i) => {
        const baseType = c.type.toLowerCase().replace(/\(.*\)/, "").trim();
        return {
          name: c.name,
          dataType: OM_DATA_TYPE[baseType] || "VARCHAR",
          dataTypeDisplay: c.type,
          ordinalPosition: i + 1,
        };
      }),
    })
  );
  await Promise.all(batch.slice(0, 10));
  if (batch.length > 10) await Promise.all(batch.slice(10));
}

export function getTableFqn(ds: DataSource, tableName: string): string {
  return `${serviceName(ds)}.${ds.database}.${schemaName(ds)}.${tableName}`;
}
