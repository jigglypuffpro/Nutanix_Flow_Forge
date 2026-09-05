import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

UserSchema.methods.comparePassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

UserSchema.statics.createUser = async function(username, password, displayName) {
  const hash = await bcrypt.hash(password, 10);
  return this.create({ username, passwordHash: hash, displayName });
};

export default mongoose.model('User', UserSchema);
