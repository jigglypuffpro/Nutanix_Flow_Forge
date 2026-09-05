import assert from 'assert';
import ConditionalExecutor from '../src/executors/ConditionalExecutor.js';
import ContextManager from '../src/engine/ContextManager.js';

const ctx = new ContextManager({});
ctx.setStepOutput('test', null, 0);

assert.strictEqual(ConditionalExecutor.evaluate('{{test.exitCode}} == 0', ctx), true);
assert.strictEqual(ConditionalExecutor.evaluate('{{test.exitCode}} != 0', ctx), false);

console.log('Executor tests passed!');
