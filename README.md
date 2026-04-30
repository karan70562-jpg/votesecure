# VoteSecure — MongoDB + Vercel Edition

Fair online voting system. One vote per user per poll, enforced in MongoDB.

## Stack
- **Frontend**: HTML + CSS + Vanilla JS
- **Backend**: Node.js serverless functions on Vercel
- **Database**: MongoDB Atlas (free M0 tier)
- **Auth**: JWT tokens + bcrypt password hashing

## Project Structure

```
votesecure/
├── index.html          ← frontend UI
├── style.css           ← styles
├── app.js              ← frontend logic (calls API)
├── vercel.json         ← Vercel routing config
├── package.json        ← dependencies
├── .env.example        ← environment variable template
├── .gitignore
└── api/
    ├── _db.js          ← shared MongoDB connection
    ├── auth.js         ← POST /api/auth?action=register|login
    ├── polls.js        ← GET/POST/PUT/DELETE /api/polls
    └── votes.js        ← POST /api/votes
```

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | /api/auth?action=register | Create account |
| POST | /api/auth?action=login | Sign in, get JWT |
| GET | /api/polls | List polls (open ones for voters, own for admin) |
| POST | /api/polls | Create poll (admin only) |
| PUT | /api/polls | Open/close poll (admin only) |
| DELETE | /api/polls?id=xxx | Delete poll + votes (admin only) |
| POST | /api/votes | Cast vote (one per user per poll, DB-enforced) |

## Deployment Steps

### 1. MongoDB Atlas
1. Go to mongodb.com/atlas → create free account
2. Create a free **M0** cluster
3. Database Access → Add user → create username + password
4. Network Access → Allow access from anywhere (0.0.0.0/0)
5. Connect → Drivers → copy connection string
6. Replace `<password>` in the string with your DB user password

### 2. Push to GitHub
```bash
# In your project folder:
git init
git add .
git commit -m "VoteSecure with MongoDB backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/votesecure.git
git push -u origin main
```

### 3. Deploy on Vercel
1. Go to vercel.com → New Project → Import your GitHub repo
2. Go to Project Settings → Environment Variables → add:
   - `MONGODB_URI` = your Atlas connection string
   - `JWT_SECRET`  = any long random string (e.g. from generate-secret.vercel.app/32)
3. Click Deploy

Your app is live at `https://votesecure.vercel.app` 🎉

### 4. Future updates
```bash
git add .
git commit -m "describe change"
git push
# Vercel auto-deploys in ~30 seconds
```

## Default Admin Account
- Email: `admin@vote.com`
- Password: `admin123`

## One-Vote Enforcement
MongoDB has a **unique compound index** on `{pollId, userId}` in the votes collection.
Even if someone tries to call the API directly, the database will reject duplicate votes with error code 11000.
