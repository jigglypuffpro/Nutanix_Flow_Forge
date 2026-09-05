import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;
  
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri || uri.includes('<username>')) {
      console.warn('[FlowForge] MongoDB URI not configured. Running in memory-only mode.');
      return;
    }
    
    await mongoose.connect(uri);
    isConnected = true;
    console.log('[FlowForge] Connected to MongoDB');
  } catch (err) {
    console.error('[FlowForge] MongoDB connection failed:', err.message);
    console.warn('[FlowForge] Falling back to in-memory mode.');
  }
}

export function isDbConnected() {
  return isConnected;
}
