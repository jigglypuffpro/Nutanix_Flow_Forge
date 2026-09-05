import 'dotenv/config';
import mongoose from 'mongoose';
import CustomWorkflow from './src/db/models/CustomWorkflow.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    await CustomWorkflow.create({
      userId: new mongoose.Types.ObjectId(),
      name: "Test",
      spec: { steps: [] }
    });
    console.log("SUCCESS");
  } catch(e) {
    console.error("ERROR:");
    console.error(e);
  }
  mongoose.disconnect();
}
run();
