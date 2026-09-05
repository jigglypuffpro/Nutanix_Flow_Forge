import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
import DAGResolver from './DAGResolver.js';
import ContextManager from './ContextManager.js';
import ShellExecutor from '../executors/ShellExecutor.js';
import RestApiExecutor from '../executors/RestApiExecutor.js';
import PluginExecutor from '../executors/PluginExecutor.js';
import ConditionalExecutor from '../executors/ConditionalExecutor.js';

class WorkflowEngine extends EventEmitter {
  constructor(workflow) {
    super();
    this.workflow = workflow;
    this.executionId = uuidv4();
    this.context = new ContextManager(workflow);
    this.dag = new DAGResolver(workflow.steps);
    this.status = 'pending';
    this.startTime = null;
    this.endTime = null;
    this.executionLog = [];
  }

  getExecutor(type) {
    switch (type) {
      case 'shell': return ShellExecutor;
      case 'rest': return RestApiExecutor;
      case 'plugin': return PluginExecutor;
      default: throw new Error(`Unknown executor type: ${type}`);
    }
  }

  async execute(overrideVariables = {}) {
    this.status = 'running';
    this.startTime = Date.now();
    this.context.variables = { ...this.context.variables, ...overrideVariables };
    
    this.emit('workflow:start', { executionId: this.executionId, workflowName: this.workflow.name });

    try {
      const levels = this.dag.resolve();
      
      for (const level of levels) {
        if (this.status === 'failed') break;
        
        // Execute steps in the current level concurrently
        await Promise.all(level.map(step => this.executeStepWithRetry(step)));
      }

      if (this.status !== 'failed') {
          this.status = 'completed';
          this.endTime = Date.now();
          this.emit('workflow:complete', this.getSummary());
      }

    } catch (error) {
      await this.handleWorkflowFailure(error, 'system');
    }

    return this.getSummary();
  }

  async executeStepWithRetry(step) {
    if (this.status === 'failed') {
        this.emitStepEvent('step:cancelled', step.name, { reason: 'Workflow failed previously' });
        return;
    }

    const maxAttempts = step.retry?.maxAttempts || 1;
    const backoffMs = step.retry?.backoffMs || 1000;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await this.executeStep(step);
            return; // Success
        } catch (error) {
            if (attempt === maxAttempts) {
                await this.handleWorkflowFailure(error, step.name);
                return;
            }
            this.emitStepEvent('step:error', step.name, { error: error.message, retry: attempt, maxAttempts });
            await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
    }
  }

  async executeStep(step) {
    const startTime = Date.now();
    this.emitStepEvent('step:start', step.name, { timestamp: startTime });

    // 1. Check Condition
    if (step.if) {
        const shouldRun = ConditionalExecutor.evaluate(step.if, this.context);
        if (!shouldRun) {
            this.emitStepEvent('step:skipped', step.name, { reason: `Condition evaluated to false: ${step.if}` });
            this.context.setStepOutput(step.name, null, 0); // Skipped steps are successful
            return;
        }
    }

    // 2. Resolve Configuration
    const resolvedConfig = this.context.resolveObject(step.config);

    // 3. Execute
    const ExecutorClass = this.getExecutor(step.type);
    const executor = new ExecutorClass(resolvedConfig, this.context, this);
    
    const result = await executor.execute();
    
    if (result.exitCode !== 0 && !result.isPluginSuccess) { // Plugin success might not use exit code in same way, but generally non-zero is failure
        if (step.type !== 'plugin' || (step.type === 'plugin' && result.exitCode !== 0)) {
           throw new Error(result.error || `Step failed with exit code ${result.exitCode}`);
        }
    }

    // 4. Store Output
    this.context.setStepOutput(step.name, result.output, result.exitCode);
    const duration = Date.now() - startTime;
    
    this.emitStepEvent('step:complete', step.name, { output: result.output, exitCode: result.exitCode, duration });
    
    this.executionLog.push({
        name: step.name,
        status: 'completed',
        output: result.output,
        exitCode: result.exitCode,
        duration
    });
  }

  async handleWorkflowFailure(error, failedStepName) {
    this.status = 'failed';
    this.endTime = Date.now();
    this.emit('workflow:failed', { executionId: this.executionId, failedStep: failedStepName, error: error.message });

    if (this.workflow.onFailure) {
        try {
            this.emit('workflow:onFailure_start', { step: failedStepName });
            const resolvedConfig = this.context.resolveObject(this.workflow.onFailure.config, { _failedStep: failedStepName });
            const ExecutorClass = this.getExecutor(this.workflow.onFailure.type);
            const executor = new ExecutorClass(resolvedConfig, this.context, this);
            await executor.execute();
        } catch (onFailureError) {
             this.emit('workflow:onFailure_error', { error: onFailureError.message });
        }
    }
  }

  emitStepEvent(event, stepName, data = {}) {
      this.emit(event, { executionId: this.executionId, stepName, ...data });
  }

  logToStep(stepName, line) {
      this.emitStepEvent('step:log', stepName, { line });
  }

  getSummary() {
      return {
          executionId: this.executionId,
          status: this.status,
          startTime: this.startTime,
          endTime: this.endTime,
          duration: this.endTime ? this.endTime - this.startTime : null,
          steps: this.executionLog
      };
  }
}

export default WorkflowEngine;
