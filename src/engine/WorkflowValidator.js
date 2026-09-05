import DAGResolver from './DAGResolver.js';

/**
 * Validates workflow JSON payloads.
 */
class WorkflowValidator {
  static validate(workflow) {
    const errors = [];

    if (!workflow || typeof workflow !== 'object') {
      return { valid: false, errors: ['Workflow must be a JSON object'] };
    }

    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push("Workflow must have a 'name' (string)");
    }

    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
      errors.push("Workflow must have 'steps' (non-empty array)");
      return { valid: errors.length === 0, errors };
    }

    const stepNames = new Set();
    for (const [index, step] of workflow.steps.entries()) {
      if (!step.name) {
        errors.push(`Step at index ${index} must have a 'name'`);
      } else {
        if (stepNames.has(step.name)) {
          errors.push(`Duplicate step name found: '${step.name}'`);
        }
        stepNames.add(step.name);
      }

      if (!step.type || !['shell', 'rest', 'plugin'].includes(step.type)) {
        errors.push(`Step '${step.name || index}' has invalid type (must be shell, rest, or plugin)`);
      }

      if (!step.config || typeof step.config !== 'object') {
        errors.push(`Step '${step.name || index}' must have a 'config' object`);
      }
    }

    // Check dependencies
    for (const step of workflow.steps) {
      if (step.dependsOn) {
        if (!Array.isArray(step.dependsOn)) {
           errors.push(`Step '${step.name}' 'dependsOn' must be an array`);
        } else {
            for (const dep of step.dependsOn) {
                if (!stepNames.has(dep)) {
                    errors.push(`Step '${step.name}' depends on unknown step '${dep}'`);
                }
            }
        }
      }
    }

    if (errors.length === 0) {
        try {
            const dag = new DAGResolver(workflow.steps);
            dag.resolve();
        } catch (e) {
            errors.push(`Invalid workflow graph: ${e.message}`);
        }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export default WorkflowValidator;
