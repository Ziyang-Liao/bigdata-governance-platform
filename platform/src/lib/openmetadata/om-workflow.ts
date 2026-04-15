import { omRequest } from "./om-client";

export async function ensureMwaaPipelineService() {
  await omRequest("PUT", "/api/v1/services/pipelineServices", {
    name: "bgp-mwaa",
    serviceType: "Airflow",
    connection: { config: { type: "Airflow", hostPort: process.env.MWAA_ENV_NAME || "bgp-mwaa", connection: { type: "BackendConnection" } } },
  });
}

export async function pushWorkflowPipeline(workflow: any) {
  await ensureMwaaPipelineService();
  const nodes = workflow.dagDefinition?.nodes || [];
  const edges = workflow.dagDefinition?.edges || [];

  const downstreamMap: Record<string, string[]> = {};
  for (const e of edges) {
    const src = e.source?.replace(/[^a-zA-Z0-9_]/g, "_");
    const tgt = e.target?.replace(/[^a-zA-Z0-9_]/g, "_");
    if (!downstreamMap[tgt]) downstreamMap[tgt] = [];
    downstreamMap[tgt].push(src);
  }

  const tasks = nodes.map((n: any) => {
    const taskId = n.id?.replace(/[^a-zA-Z0-9_]/g, "_");
    return {
      name: taskId,
      description: n.data?.label || n.type,
      taskType: n.type === "sync" ? "sync" : n.type === "sql" ? "sql" : "python",
      downstreamTasks: downstreamMap[taskId] || [],
    };
  });

  await omRequest("PUT", "/api/v1/pipelines", {
    name: workflow.name || workflow.workflowId,
    service: "bgp-mwaa",
    description: workflow.description || `ETL workflow: ${workflow.name}`,
    tasks,
    scheduleInterval: workflow.cronExpression || undefined,
  });
}
