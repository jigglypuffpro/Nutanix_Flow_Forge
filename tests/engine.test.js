import assert from 'assert';
import DAGResolver from '../src/engine/DAGResolver.js';
import ContextManager from '../src/engine/ContextManager.js';

// Test ContextManager
const ctx = new ContextManager({ variables: { env: 'prod' } });
ctx.setStepOutput('build', 'success', 0);
assert.strictEqual(ctx.resolve('Env is {{variables.env}}'), 'Env is prod');
assert.strictEqual(ctx.resolve('Build result: {{build.output}}'), 'Build result: success');

// Test DAGResolver
const steps = [
    { name: 'A' },
    { name: 'B', dependsOn: ['A'] },
    { name: 'C', dependsOn: ['A'] },
    { name: 'D', dependsOn: ['B', 'C'] }
];
const dag = new DAGResolver(steps);
const levels = dag.resolve();

assert.strictEqual(levels.length, 3);
assert.deepStrictEqual(levels[0].map(s => s.name), ['A']);
assert.deepStrictEqual(levels[1].map(s => s.name).sort(), ['B', 'C'].sort());
assert.deepStrictEqual(levels[2].map(s => s.name), ['D']);

console.log('Engine tests passed!');
