// api/auth.js — /api/auth?action=register|login
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, cors } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'votesecure_jwt_secret_change_me';

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const { action } = req.query;
  const db = await getDb();
  const users = db.collection('users');

  // ── REGISTER ──────────────────────────────────────────────
  if (req.method === 'POST' && action === 'register') {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.status(409).json({ error: 'An account with this email already exists' });

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: 'voter',
      createdAt: new Date()
    };
    const result = await users.insertOne(user);

    const token = jwt.sign(
      { id: result.insertedId.toString(), name, email: user.email, role: 'voter' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.status(201).json({ token, user: { id: result.insertedId, name, email: user.email, role: 'voter' } });
  }

  // ── LOGIN ─────────────────────────────────────────────────
  if (req.method === 'POST' && action === 'login') {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    // Check built-in admin account
    if (email.toLowerCase() === 'admin@vote.com' && password === 'admin123') {
      const token = jwt.sign(
        { id: 'admin', name: 'Admin', email: 'admin@vote.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      return res.json({ token, user: { id: 'admin', name: 'Admin', email: 'admin@vote.com', role: 'admin' } });
    }

    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.status(401).json({ error: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign(
      { id: user._id.toString(), name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
