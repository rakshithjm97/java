export enum Role {
  PM = 'PM',
  TL = 'TL',
  SYS = 'SYS',
  ADM = 'ADM',
  SGA = 'SGA',
  GA = 'GA'
}

export enum WorkflowType {
  SPAN_CORRECTION = 'Span Correction',
  SPAN_VALIDATION = 'Span Validation',
  TREE_GRASS = 'Tree Grass',
  TREE_HEALTH = 'Tree Health'
}

export enum WorkflowPhase {
  PRE_PRODUCTION = 'Pre Production',
  POST_PRODUCTION = 'Post Production'
}

export enum StepStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  MANUAL_REQUIRED = 'MANUAL_REQUIRED'
}

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: StepStatus;
  role: Role[];
  isAutomatic: boolean;
  updatedAt: string;
  error?: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
}

export interface WorkflowInstance {
  id: string;
  type: WorkflowType;
  phase: WorkflowPhase;
  jiraTicket: string;
  costSheetId: string;
  jiraLms?: string;
  costSheetLms?: string;
  s3Path?: string;
  shapefileLms?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  currentStepIndex: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}
