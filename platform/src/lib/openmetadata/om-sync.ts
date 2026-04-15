import { omRequest, getEntityByName } from "./om-client";

const REDSHIFT_SERVICE = "bgp-redshift-dev";

export async function ensureRedshiftService(workgroup: string, database: string, schema: string) {
  await omRequest("PUT", "/api/v1/services/databaseServices", {
    name: REDSHIFT_SERVICE,
    serviceType: "Redshift",
    connection: { config: { type: "Redshift", scheme: "redshift+psycopg2", hostPort: `${workgroup}.redshift-serverless:5439`, username: "admin", authType: { password: "iam-managed" }, database } },
  });
  await omRequest("PUT", "/api/v1/databases", { name: database, service: REDSHIFT_SERVICE });
  await omRequest("PUT", "/api/v1/databaseSchemas", { name: schema, database: `${REDSHIFT_SERVICE}.${database}` });
}

export async function ensureSyncPipelineService() {
  await omRequest("PUT", "/api/v1/services/pipelineServices", {
    name: "bgp-sync",
    serviceType: "CustomPipeline",
    connection: { config: { type: "CustomPipeline", sourcePythonClass: "bgp.sync.GlueETL" } },
  });
}

export async function pushSyncPipeline(task: any) {
  await ensureSyncPipelineService();
  const tasks = (task.sourceTables || []).map((t: string) => ({ name: `sync_${t}`, description: `Sync ${t}`, taskType: "sync" }));
  await omRequest("PUT", "/api/v1/pipelines", {
    name: task.name || task.taskId,
    service: "bgp-sync",
    description: `${task.syncMode} sync → ${task.targetType}`,
    tasks,
    scheduleInterval: task.cronExpression || undefined,
  });
}

export async function pushLineage(
  sourceDsFqnPrefix: string,
  targetFqnPrefix: string,
  tables: string[],
  fieldMappings?: Record<string, { source: string; target: string }[]>,
  pipelineFqn?: string,
) {
  for (const table of tables) {
    const fromFqn = `${sourceDsFqnPrefix}.${table}`;
    const toFqn = `${targetFqnPrefix}.${table}`;

    const fromEntity = await getEntityByName("tables", fromFqn);
    const toEntity = await getEntityByName("tables", toFqn);
    if (!fromEntity?.id || !toEntity?.id) continue;

    const edge: any = {
      fromEntity: { id: fromEntity.id, type: "table" },
      toEntity: { id: toEntity.id, type: "table" },
    };

    const details: any = {};
    if (pipelineFqn) {
      const pipeline = await getEntityByName("pipelines", pipelineFqn);
      if (pipeline?.id) details.pipeline = { id: pipeline.id, type: "pipeline" };
    }

    const mappings = fieldMappings?.[table];
    if (mappings?.length) {
      details.columnsLineage = mappings.map((m) => ({
        fromColumns: [`${fromFqn}.${m.source}`],
        toColumn: `${toFqn}.${m.target}`,
      }));
    }

    if (Object.keys(details).length) edge.lineageDetails = details;
    await omRequest("PUT", "/api/v1/lineage", { edge });
  }
}
