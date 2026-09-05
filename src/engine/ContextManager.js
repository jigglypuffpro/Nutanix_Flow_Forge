/**
 * Manages the execution state and variable interpolation for workflows.
 */
class ContextManager {
  constructor(workflowConfig) {
    this.variables = workflowConfig.variables || {};
    this.outputs = {}; // { stepName: { output: ..., exitCode: ... } }
  }

  setStepOutput(stepName, output, exitCode) {
    this.outputs[stepName] = { output, exitCode };
  }

  getStepOutput(stepName) {
    return this.outputs[stepName];
  }

  /**
   * Resolves a string containing template variables like {{stepName.output.path}}
   */
  resolve(templateString, extraContext = {}) {
    if (typeof templateString !== 'string') return templateString;

    const regex = /\{\{([\w._]+)\}\}/g;
    return templateString.replace(regex, (match, path) => {
      const parts = path.split('.');
      const root = parts[0];

      let value;

      if (root === 'variables') {
        value = this.variables[parts[1]];
      } else if (root === 'env') {
        value = process.env[parts[1]];
      } else if (extraContext[root] !== undefined) {
          value = extraContext[root];
      } else if (this.outputs[root]) {
        // e.g., stepName.output.data.id
        value = this.outputs[root];
        for (let i = 1; i < parts.length; i++) {
          if (value == null) break;
          value = value[parts[i]];
        }
      }

      // If resolving to an object/array within a string context, we might want to JSON.stringify it,
      // but typically we just stringify simple replacements or leave as is if the whole string is the template.
      if (value === undefined) {
          return match; // Leave unreplaced if not found
      }
      
      if (typeof value === 'object') {
          // If the entire template string is just the variable, return the object directly
          if (templateString === match) {
              return value; // A bit of a hack since replace usually returns string, but we can't easily return object from replace.
          }
          return JSON.stringify(value);
      }

      return value;
    });
  }
  
  /**
   * Helper to deeply resolve an object
   */
  resolveObject(obj, extraContext = {}) {
    if (typeof obj === 'string') {
        const resolved = this.resolve(obj, extraContext);
        // Handle the case where a single template resolves to an object
        if (typeof resolved === 'string' && resolved.startsWith('{') && resolved.endsWith('}') && obj === `{{${obj.match(/\{\{([\w._]+)\}\}/)?.[1]}}}`) {
             // We can't perfectly do this with just replace.
        }
        return resolved;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => this.resolveObject(item, extraContext));
    }
    if (obj !== null && typeof obj === 'object') {
        const resolvedObj = {};
        for (const [key, value] of Object.entries(obj)) {
            resolvedObj[key] = this.resolveObject(value, extraContext);
        }
        return resolvedObj;
    }
    return obj;
  }
}

export default ContextManager;
