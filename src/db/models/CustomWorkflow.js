import mongoose from 'mongoose';

const CustomWorkflowSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  spec: { type: mongoose.Schema.Types.Mixed, required: true }, // The full JSON workflow spec
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CustomWorkflowSchema.pre('save', function() {
  this.updatedAt = new Date();
});

export default mongoose.model('CustomWorkflow', CustomWorkflowSchema);
