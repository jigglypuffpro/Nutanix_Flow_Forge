import 'dotenv/config';
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
import { connectDB, isDbConnected } from '../db/mongoose.js';
import { requireAuth, registerUser, loginUser, signToken } from './auth.js';
import CustomWorkflow from '../db/models/CustomWorkflow.js';
import ExecutionModel from '../db/models/Execution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wsManager = new WebSocketManager(server);

// Connect to MongoDB (non-blocking — falls back gracefully)
await connectDB();

// In-memory fallback storage
const inMemoryExecutions = new Map();
const inMemoryCustomWorkflows = new Map();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

// In-memory workflow store (validated specs, ready for execution)
const workflows = new Map();

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────

app.post('/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  try {
    const user = await registerUser(username.trim(), password, (displayName || username).trim());
    const token = signToken({ userId: user._id.toString(), username: user.username, displayName: user.displayName });
    res.status(201).json({ token, displayName: user.displayName, username: user.username });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  try {
    const user = await loginUser(username.trim(), password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const token = signToken({ userId: user._id.toString(), username: user.username, displayName: user.displayName });
    res.json({ token, displayName: user.displayName, username: user.username });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Token verification endpoint (used by frontend on page load)
app.get('/auth/me', requireAuth, (req, res) => {
  res.json({ userId: req.userId, username: req.username, displayName: req.displayName });
});

// ─── WORKFLOW ROUTES ──────────────────────────────────────────────────────────

app.post('/api/workflows', requireAuth, (req, res) => {
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

app.get('/api/workflows', requireAuth, (req, res) => {
  const list = Array.from(workflows.values()).map(w => ({
    id: w.id, name: w.name, description: w.description,
    createdAt: w.createdAt, stepCount: w.steps?.length || 0
  }));
  res.json(list);
});

app.get('/api/workflows/:id', requireAuth, (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
  res.json(workflow);
});

// Execute a workflow
app.post('/api/workflows/:id/execute', requireAuth, async (req, res) => {
  const workflow = workflows.get(req.params.id);
  if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

  const engine = new WorkflowEngine(workflow);
  wsManager.attachEngine(engine);
  const variables = req.body?.variables || {};

  const execData = {
    executionId: engine.executionId,
    userId: req.userId,
    workflowName: workflow.name || 'Unnamed',
    status: 'running',
    startTime: new Date()
  };

  if (isDbConnected()) {
    await ExecutionModel.create(execData).catch(console.error);
  } else {
    inMemoryExecutions.set(engine.executionId, { ...execData, duration: null });
  }

  setTimeout(() => {
    engine.execute(variables).then(async summary => {
      if (isDbConnected()) {
        await ExecutionModel.findOneAndUpdate(
          { executionId: summary.executionId },
          { status: summary.status, duration: summary.duration, steps: summary.steps || [] },
          { new: true }
        ).catch(console.error);
      } else {
        const existing = inMemoryExecutions.get(summary.executionId) || {};
        inMemoryExecutions.set(summary.executionId, { ...existing, ...summary });
      }
    }).catch(err => console.error('Engine execution failed:', err));
  }, 100);

  res.status(202).json({ executionId: engine.executionId, status: 'running' });
});

// ─── CUSTOM WORKFLOWS API ─────────────────────────────────────────────────────

app.get('/api/custom-workflows', requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      const wfs = await CustomWorkflow.find({ userId: req.userId }).sort({ createdAt: -1 });
      return res.json(wfs);
    }
    const all = Array.from(inMemoryCustomWorkflows.values()).filter(w => w.userId === req.userId);
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/custom-workflows', requireAuth, async (req, res) => {
  const { name, description, spec } = req.body;
  if (!name || !spec) return res.status(400).json({ error: 'name and spec are required' });

  const validation = WorkflowValidator.validate(spec);
  if (!validation.valid) {
    return res.status(400).json({ error: 'Invalid workflow spec', details: validation.errors });
  }

  try {
    if (isDbConnected()) {
      const wf = await CustomWorkflow.create({
        userId: req.userId, name, description: description || '', spec
      });
      return res.status(201).json(wf);
    }
    const id = uuidv4();
    const wf = { _id: id, userId: req.userId, name, description: description || '', spec, createdAt: new Date() };
    inMemoryCustomWorkflows.set(id, wf);
    res.status(201).json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/custom-workflows/:id', requireAuth, async (req, res) => {
  const { name, description, spec } = req.body;
  try {
    if (isDbConnected()) {
      const wf = await CustomWorkflow.findOneAndUpdate(
        { _id: req.params.id, userId: req.userId },
        { name, description, spec, updatedAt: new Date() },
        { new: true }
      );
      if (!wf) return res.status(404).json({ error: 'Not found' });
      return res.json(wf);
    }
    const wf = inMemoryCustomWorkflows.get(req.params.id);
    if (!wf || wf.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
    Object.assign(wf, { name, description, spec });
    res.json(wf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/custom-workflows/:id', requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      await CustomWorkflow.findOneAndDelete({ _id: req.params.id, userId: req.userId });
      return res.json({ ok: true });
    }
    inMemoryCustomWorkflows.delete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── EXECUTIONS ───────────────────────────────────────────────────────────────

app.get('/api/executions', requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      const execs = await ExecutionModel.find({ userId: req.userId }).sort({ startTime: -1 }).limit(20);
      return res.json(execs);
    }
    const all = Array.from(inMemoryExecutions.values()).reverse();
    res.json(all);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/executions/:id', requireAuth, async (req, res) => {
  try {
    if (isDbConnected()) {
      const exec = await ExecutionModel.findOne({ executionId: req.params.id, userId: req.userId });
      if (!exec) return res.status(404).json({ error: 'Not found' });
      return res.json(exec);
    }
    const exec = inMemoryExecutions.get(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Not found' });
    res.json(exec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
server.listen(config.port, () => {
  console.log(`FlowForge Server running on http://localhost:${config.port}`);
});
