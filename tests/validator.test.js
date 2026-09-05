import assert from 'assert';
import WorkflowValidator from '../src/engine/WorkflowValidator.js';

const validWorkflow = {
    name: 'Test',
    steps: [
        { name: 'step1', type: 'shell', config: { command: 'echo hello' } }
    ]
};

const result = WorkflowValidator.validate(validWorkflow);
assert.strictEqual(result.valid, true);

const invalidWorkflow = {
    name: 'Test',
    steps: [
        { name: 'step1', type: 'unknown_type', config: {} }
    ]
};
const result2 = WorkflowValidator.validate(invalidWorkflow);
assert.strictEqual(result2.valid, false);
assert.strictEqual(result2.errors.length > 0, true);

console.log('Validator tests passed!');
