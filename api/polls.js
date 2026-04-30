// api/polls.js — /api/polls
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

  const db = await getDb();
  const polls = db.collection('polls');
  const votes = db.collection('votes');

  // ── GET — list all open polls (voter) or own polls (admin) ──
  if (req.method === 'GET') {
    let query = user.role === 'admin'
      ? { createdBy: user.id }
      : { open: true };

    const list = await polls.find(query).sort({ createdAt: -1 }).toArray();

    // attach vote counts
    const enriched = await Promise.all(list.map(async poll => {
      const pollId = poll._id.toString();
      const voteCounts = {};
      poll.options.forEach((_, i) => { voteCounts[i] = 0; });
      const allVotes = await votes.find({ pollId }).toArray();
      allVotes.forEach(v => { voteCounts[v.optionIndex] = (voteCounts[v.optionIndex] || 0) + 1; });
      const myVote = allVotes.find(v => v.userId === user.id);
      return {
        ...poll,
        id: pollId,
        voteCounts,
        totalVotes: allVotes.length,
        myVote: myVote ? myVote.optionIndex : null
      };
    }));

    return res.json(enriched);
  }

  // ── POST — create poll (admin only) ────────────────────────
  if (req.method === 'POST') {
    if (user.role !== 'admin')
      return res.status(403).json({ error: 'Only admins can create polls' });

    const { question, options } = req.body;
    if (!question || !options || options.length < 2)
      return res.status(400).json({ error: 'Question and at least 2 options required' });

    const poll = {
      question,
      options: options.map(o => o.trim()).filter(Boolean),
      createdBy: user.id,
      open: true,
      createdAt: new Date()
    };
    const result = await polls.insertOne(poll);
    return res.status(201).json({ ...poll, id: result.insertedId.toString() });
  }

  // ── PUT — toggle open/close or update (admin only) ─────────
  if (req.method === 'PUT') {
    if (user.role !== 'admin')
      return res.status(403).json({ error: 'Only admins can update polls' });

    const { id, open } = req.body;
    if (!id) return res.status(400).json({ error: 'Poll ID required' });

    await polls.updateOne(
      { _id: new ObjectId(id), createdBy: user.id },
      { $set: { open } }
    );
    return res.json({ success: true });
  }

  // ── DELETE — remove poll and its votes (admin only) ────────
  if (req.method === 'DELETE') {
    if (user.role !== 'admin')
      return res.status(403).json({ error: 'Only admins can delete polls' });

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Poll ID required' });

    await polls.deleteOne({ _id: new ObjectId(id), createdBy: user.id });
    await votes.deleteMany({ pollId: id });
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
