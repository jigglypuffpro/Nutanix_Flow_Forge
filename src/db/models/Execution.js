import mongoose from 'mongoose';

const StepResultSchema = new mongoose.Schema({
  stepName: String,
  status: String,
  output: String,
  duration: Number,
  error: String
}, { _id: false });

const ExecutionSchema = new mongoose.Schema({
  executionId: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  workflowName: { type: String, default: 'Unknown' },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  startTime: { type: Date, default: Date.now },
  duration: { type: Number, default: null }, // ms
  steps: [StepResultSchema]
});

export default mongoose.model('Execution', ExecutionSchema);
