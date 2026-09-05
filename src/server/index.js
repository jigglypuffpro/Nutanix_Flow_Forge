import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

import config from '../../flowforge.config.js';
import WorkflowValidator from '../engine/WorkflowValidator.js';
import WorkflowEngine from '../engine/WorkflowEngine.js';
import WebSocketManager from './WebSocketManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wsManager = new WebSocketManager(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// In-memory storage for workflows and executions
const workflows = new Map();
const executions = new Map();

// API Routes

// Validate and store a workflow
app.post('/api/workflows', (req, res) => {
  const workflowData = req.body;
  const validation = WorkflowValidator.validate(workflowData);

  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid workflow', details: validation.errors });
  }

  const id = uuidv4();
  workflowData.id = id;
  workflowData.createdAt = new Date().toISOString();
  workflows.set(id, workflowData);

  res.status(201).json({ id, name: workflowData.name, status: 'validated' });
});

// List workflows
app.get('/api/workflows', (req, res) => {
  const list = Array.from(workflows.values()).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    createdAt: w.createdAt,
    stepCount: w.steps?.length || 0
  }));
  res.json(list);
});

// Get workflow by ID
app.get('/api/workflows/:id', (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  res.json(workflow);
});

// Execute a workflow
app.post('/api/workflows/:id/execute', (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }

  const engine = new WorkflowEngine(workflow);
  wsManager.attachEngine(engine);
  
  const variables = req.body.variables || {};
  
  // Start async execution
  engine.execute(variables).then(summary => {
      executions.set(summary.executionId, summary);
  }).catch(err => {
      console.error("Engine execution failed globally:", err);
  });

  res.status(202).json({ executionId: engine.executionId, status: 'running' });
});

// List executions
app.get('/api/executions', (req, res) => {
  res.json(Array.from(executions.values()));
});

// Get execution by ID
app.get('/api/executions/:id', (req, res) => {
    const exec = executions.get(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Execution not found' });
    res.json(exec);
});

// Start server
server.listen(config.port, () => {
  console.log(`FlowForge Server running on http://localhost:${config.port}`);
});
