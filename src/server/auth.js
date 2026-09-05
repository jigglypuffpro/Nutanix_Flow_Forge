import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../db/models/User.js';
import { isDbConnected } from '../db/mongoose.js';

const JWT_SECRET = process.env.JWT_SECRET || 'flowforge-jwt-dev-secret-change-me';
const JWT_EXPIRES = '7d';

// In-memory user store (used when MongoDB is not connected)
const inMemoryUsers = new Map(); // username -> user object

// ─── Token helpers ─────────────────────────────────────────────────────────────

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ─── Express middleware ────────────────────────────────────────────────────────

export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userId = decoded.userId;
  req.username = decoded.username;
  req.displayName = decoded.displayName;
  next();
}

// ─── User operations ───────────────────────────────────────────────────────────

export async function registerUser(username, password, displayName) {
  if (!isDbConnected()) {
    if (inMemoryUsers.has(username)) {
      throw new Error('Username already taken');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      _id: `mem_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      username,
      displayName: displayName || username,
      passwordHash
    };
    inMemoryUsers.set(username, user);
    return user;
  }

  // MongoDB path
  const existing = await User.findOne({ username });
  if (existing) throw new Error('Username already taken');
  const hash = await bcrypt.hash(password, 10);
  return User.create({ username, passwordHash: hash, displayName: displayName || username });
}

export async function loginUser(username, password) {
  if (!isDbConnected()) {
    const user = inMemoryUsers.get(username);
    if (!user) return null;
    const match = await bcrypt.compare(password, user.passwordHash);
    return match ? user : null;
  }

  const user = await User.findOne({ username });
  if (!user) return null;
  const match = await bcrypt.compare(password, user.passwordHash);
  return match ? user : null;
}
