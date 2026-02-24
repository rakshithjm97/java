import express from 'express';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import { WorkflowType, WorkflowPhase, StepStatus, Role } from './src/types.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('geoflow.db');

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS workflows (
    id TEXT PRIMARY KEY,
    type TEXT,
    phase TEXT,
    jiraTicket TEXT,
    costSheetId TEXT,
    jiraLms TEXT,
    costSheetLms TEXT,
    s3Path TEXT,
    shapefileLms TEXT,
    status TEXT,
    currentStepIndex INTEGER,
    steps TEXT,
    createdAt TEXT,
    updatedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    role TEXT
  );
`);

// Migration: Add missing columns if they don't exist
try {
  db.exec("ALTER TABLE workflows ADD COLUMN jiraLms TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE workflows ADD COLUMN costSheetLms TEXT");
} catch (e) {}
try {
  db.exec("ALTER TABLE workflows ADD COLUMN shapefileLms TEXT");
} catch (e) {}

// Seed default users if empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const seedUsers = [
    { id: '1', name: 'Alice (PM)', role: Role.PM },
    { id: '2', name: 'Bob (TL)', role: Role.TL },
    { id: '3', name: 'Charlie (SYS)', role: Role.SYS },
    { id: '4', name: 'Dave (GA)', role: Role.GA },
    { id: '5', name: 'Eve (SGA)', role: Role.SGA },
  ];
  const insert = db.prepare('INSERT INTO users (id, name, role) VALUES (?, ?, ?)');
  seedUsers.forEach(u => insert.run(u.id, u.name, u.role));
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/users', (req, res) => {
    const users = db.prepare('SELECT * FROM users').all();
    res.json(users);
  });

  app.get('/api/workflows', (req, res) => {
    const workflows = db.prepare('SELECT * FROM workflows ORDER BY updatedAt DESC').all();
    res.json(workflows.map(w => ({
      ...w,
      steps: JSON.parse(w.steps as string)
    })));
  });

  app.post('/api/workflows', (req, res) => {
    const { type, phase, jiraTicket, costSheetId } = req.body;
    const id = Math.random().toString(36).substr(2, 9);
    
    // Define steps based on type and phase (simplified from flowcharts)
    const steps = getInitialSteps(type, phase);
    
    const now = new Date().toISOString();
    const workflow = {
      id,
      type,
      phase,
      jiraTicket,
      costSheetId,
      status: 'ACTIVE',
      currentStepIndex: 0,
      steps: JSON.stringify(steps),
      createdAt: now,
      updatedAt: now
    };

    db.prepare(`
      INSERT INTO workflows (id, type, phase, jiraTicket, costSheetId, status, currentStepIndex, steps, createdAt, updatedAt, jiraLms, costSheetLms, s3Path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)
    `).run(workflow.id, workflow.type, workflow.phase, workflow.jiraTicket, workflow.costSheetId, workflow.status, workflow.currentStepIndex, workflow.steps, workflow.createdAt, workflow.updatedAt);

    res.json({ ...workflow, steps });
  });

  app.post('/api/workflows/:id/step/complete', (req, res) => {
    const { id } = req.params;
    const { jiraLms, costSheetLms, s3Path, shapefileLms, forceFail } = req.body;
    
    try {
      const workflow = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as any;
      if (!workflow) return res.status(404).json({ error: 'Not found' });
      if (workflow.status === 'FAILED' || workflow.status === 'COMPLETED') {
        return res.status(400).json({ error: 'Workflow is already finished' });
      }

      const steps = JSON.parse(workflow.steps);
      const currentIndex = workflow.currentStepIndex;
      
      if (currentIndex < steps.length) {
        let nextStatus = workflow.status;
        let nextIndex = currentIndex + 1;

        // Logic for specific steps
        const currentStep = steps[currentIndex];
        
        // If it's a matching check step, we might fail the workflow
        if (currentStep.name.includes('Matching Check')) {
          if (workflow.jiraLms !== workflow.costSheetLms) {
            nextStatus = 'FAILED';
            currentStep.status = StepStatus.FAILED;
            currentStep.error = `LMS Mismatch: Jira (${workflow.jiraLms}) != Cost Sheet (${workflow.costSheetLms})`;
          } else {
            currentStep.status = StepStatus.COMPLETED;
          }
        } else if (currentStep.name.includes('Triangulation Check')) {
          if (workflow.jiraLms !== workflow.costSheetLms || workflow.jiraLms !== workflow.shapefileLms) {
            nextStatus = 'FAILED';
            currentStep.status = StepStatus.FAILED;
            currentStep.error = `Triangulation Failure: Values do not match. Jira: ${workflow.jiraLms}, CS: ${workflow.costSheetLms}, Shape: ${workflow.shapefileLms}`;
          } else {
            currentStep.status = StepStatus.COMPLETED;
          }
        } else {
          currentStep.status = StepStatus.COMPLETED;
        }

        currentStep.updatedAt = new Date().toISOString();
        
        if (nextStatus !== 'FAILED') {
          if (nextIndex >= steps.length) {
            nextStatus = 'COMPLETED';
          } else {
            steps[nextIndex].status = StepStatus.IN_PROGRESS;
          }
        } else {
          // If failed, we don't advance the index to the next step
          nextIndex = currentIndex; 
        }

        // Only update LMS/S3 if they are provided and not empty
        const updateFields = [];
        const params = [nextIndex, JSON.stringify(steps), nextStatus, new Date().toISOString()];
        
        if (jiraLms !== undefined && jiraLms !== null && jiraLms !== '') {
          updateFields.push('jiraLms = ?');
          params.push(jiraLms);
        }
        if (costSheetLms !== undefined && costSheetLms !== null && costSheetLms !== '') {
          updateFields.push('costSheetLms = ?');
          params.push(costSheetLms);
        }
        if (s3Path !== undefined && s3Path !== null && s3Path !== '') {
          updateFields.push('s3Path = ?');
          params.push(s3Path);
        }
        if (shapefileLms !== undefined && shapefileLms !== null && shapefileLms !== '') {
          updateFields.push('shapefileLms = ?');
          params.push(shapefileLms);
        }
        
        params.push(id);

        const sql = `
          UPDATE workflows 
          SET currentStepIndex = ?, steps = ?, status = ?, updatedAt = ?
          ${updateFields.length > 0 ? ', ' + updateFields.join(', ') : ''}
          WHERE id = ?
        `;
        
        db.prepare(sql).run(...params);
        console.log(`Workflow ${id} updated. Next index: ${nextIndex}, Status: ${nextStatus}`);
      }

      res.json({ success: true });
    } catch (err) {
      console.error('Error completing step:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

function getInitialSteps(type: WorkflowType, phase: WorkflowPhase) {
  // Updated initial steps based on user request
  const commonPre = [
    { id: '1', name: 'Input Jira & Cost Sheet LMS', status: StepStatus.IN_PROGRESS, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
    { id: '2', name: 'Matching Check (LMS)', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
    { id: '3', name: 'Enter S3 Path', status: StepStatus.PENDING, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
    { id: '4', name: 'Read from S3 & Extract LMS', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
    { id: '5', name: 'Final LMS Triangulation Check', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
  ];

  if (type === WorkflowType.SPAN_CORRECTION) {
    if (phase === WorkflowPhase.PRE_PRODUCTION) {
      return [
        ...commonPre,
        { id: '6', name: 'Verify Underground & Secondary wires', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '7', name: 'TX / Dx check', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '8', name: 'Create tables in database', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
      ];
    } else {
      return [
        { id: '1', name: 'Deleted spans check', status: StepStatus.IN_PROGRESS, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '2', name: 'Non-Corrected Span Identification', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '3', name: 'Null-Geometry Check', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '4', name: 'Overlap span check', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '5', name: 'Spot check', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '6', name: 'Final Files Zipped', status: StepStatus.PENDING, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
      ];
    }
  }

  if (type === WorkflowType.TREE_GRASS || type === WorkflowType.TREE_HEALTH) {
    if (phase === WorkflowPhase.PRE_PRODUCTION) {
      return [
        ...commonPre,
        { id: '6', name: 'Perform BBOX configuration check', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '7', name: 'Model-predicted polygons Verification', status: StepStatus.PENDING, role: [Role.SGA, Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '8', name: 'Review leaf-off season imagery', status: StepStatus.PENDING, role: [Role.SGA, Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '9', name: 'Read and create tables in database', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
      ];
    } else {
      return [
        { id: '1', name: 'Spot Check', status: StepStatus.IN_PROGRESS, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '2', name: 'Fix the name format', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '3', name: 'Update feeder name attribute', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '4', name: 'Fix invalid geometries', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '5', name: 'Final Files Zipped', status: StepStatus.PENDING, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
      ];
    }
  }

  if (type === WorkflowType.SPAN_VALIDATION) {
    if (phase === WorkflowPhase.PRE_PRODUCTION) {
      return [
        ...commonPre,
        { id: '6', name: 'Column names check', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '7', name: 'Bbox configuration', status: StepStatus.PENDING, role: [Role.SYS, Role.ADM], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '8', name: 'Image coverage check', status: StepStatus.PENDING, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
      ];
    } else {
      return [
        { id: '1', name: 'Matching Localtitle with corrected data', status: StepStatus.IN_PROGRESS, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '2', name: 'Gis_vcat, hcat & Clearance field check', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: false, updatedAt: new Date().toISOString() },
        { id: '3', name: 'Efficient Feeder Splitting (Python)', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '4', name: 'Data type fixing', status: StepStatus.PENDING, role: [Role.GA], isAutomatic: true, updatedAt: new Date().toISOString() },
        { id: '5', name: 'Final Files Zipped', status: StepStatus.PENDING, role: [Role.TL], isAutomatic: false, updatedAt: new Date().toISOString() },
      ];
    }
  }
  
  // Default fallback steps
  return commonPre;
}

startServer();
