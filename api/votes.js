// api/votes.js — /api/votes
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { getDb, cors } from './_db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'votesecure_jwt_secret_change_me';

function auth(req) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

export default async function handler(req, res) {
  if (cors(req, res)) return;

  const user = auth(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { pollId, optionIndex } = req.body;
  if (!pollId || optionIndex === undefined)
    return res.status(400).json({ error: 'pollId and optionIndex are required' });

  const db = await getDb();
  const polls = db.collection('polls');
  const votes = db.collection('votes');

  // Check poll exists and is open
  const poll = await polls.findOne({ _id: new ObjectId(pollId) });
  if (!poll)
    return res.status(404).json({ error: 'Poll not found' });
  if (!poll.open)
    return res.status(403).json({ error: 'This poll is closed' });
  if (optionIndex < 0 || optionIndex >= poll.options.length)
    return res.status(400).json({ error: 'Invalid option' });

  // ── ONE VOTE PER USER PER POLL — enforced in DB ────────────
  // unique index on {pollId, userId} prevents duplicate votes at DB level
  try {
    await votes.createIndex({ pollId: 1, userId: 1 }, { unique: true });
    await votes.insertOne({
      pollId,
      userId: user.id,
      optionIndex,
      votedAt: new Date()
    });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ error: 'You have already voted in this poll' });
    throw err;
  }

  return res.status(201).json({ success: true, message: 'Vote recorded' });
}
