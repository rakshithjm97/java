import { WorkflowInstance, WorkflowType, WorkflowPhase, User } from '../types';

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch('/api/users');
  return res.json();
}

export async function fetchWorkflows(): Promise<WorkflowInstance[]> {
  const res = await fetch('/api/workflows');
  return res.json();
}

export async function createWorkflow(data: {
  type: WorkflowType;
  phase: WorkflowPhase;
  jiraTicket: string;
  costSheetId: string;
}): Promise<WorkflowInstance> {
  const res = await fetch('/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function completeStep(workflowId: string, data?: { jiraLms?: string, costSheetLms?: string, s3Path?: string, shapefileLms?: string }): Promise<void> {
  await fetch(`/api/workflows/${workflowId}/step/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  });
}
