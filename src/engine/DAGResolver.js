/**
 * Resolves the Directed Acyclic Graph (DAG) of workflow steps.
 */
class DAGResolver {
  constructor(steps) {
    this.steps = steps;
    this.stepMap = new Map(steps.map(step => [step.name, step]));
  }

  /**
   * Sorts steps into execution levels (arrays of independent steps that can run in parallel).
   * Throws if there's a cycle or missing dependency.
   * @returns {Array<Array<Object>>} Array of levels, where each level is an array of steps.
   */
  resolve() {
    const inDegree = new Map();
    const adjList = new Map();

    // Initialize structures
    for (const step of this.steps) {
      inDegree.set(step.name, 0);
      adjList.set(step.name, []);
    }

    // Build the graph
    for (const step of this.steps) {
      const dependsOn = step.dependsOn || [];
      for (const dep of dependsOn) {
        if (!this.stepMap.has(dep)) {
          throw new Error(`Step '${step.name}' depends on unknown step '${dep}'`);
        }
        adjList.get(dep).push(step.name);
        inDegree.set(step.name, inDegree.get(step.name) + 1);
      }
    }

    // Kahn's algorithm for topological sorting, modified to group by levels
    const levels = [];
    let currentLevelQueue = [];

    // Find all nodes with 0 in-degree
    for (const [node, degree] of inDegree.entries()) {
      if (degree === 0) {
        currentLevelQueue.push(node);
      }
    }

    let processedCount = 0;

    while (currentLevelQueue.length > 0) {
      const nextLevelQueue = [];
      const currentLevelSteps = [];

      for (const node of currentLevelQueue) {
        currentLevelSteps.push(this.stepMap.get(node));
        processedCount++;

        for (const neighbor of adjList.get(node)) {
          inDegree.set(neighbor, inDegree.get(neighbor) - 1);
          if (inDegree.get(neighbor) === 0) {
            nextLevelQueue.push(neighbor);
          }
        }
      }

      levels.push(currentLevelSteps);
      currentLevelQueue = nextLevelQueue;
    }

    if (processedCount !== this.steps.length) {
      throw new Error('Cycle detected in workflow dependencies');
    }

    return levels;
  }
}

export default DAGResolver;
