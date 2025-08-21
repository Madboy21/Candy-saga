import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { Server as IOServer } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import User from './models/User.js';
import Score from './models/Score.js';
import Winner from './models/Winner.js';
import { dhakaStamp, dhakaNow } from './utils/dhaka.js';

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.vercel.app' : 'localhost';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin';

// MongoDB connection
try {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('MongoDB connected');
} catch (err) { console.error('MongoDB error', err); process.exit(1); }

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, { cors: { origin: CORS_ORIGIN, methods: ['GET','POST'], credentials: true } });

app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 60*1000, limit: 300 }));

// UID middleware
app.use((req,res,next)=>{
  if(!req.cookies?.uid){
    const uid = uuidv4();
    res.cookie('uid', uid, { httpOnly:true, sameSite:'none', secure: process.env.NODE_ENV==='production', domain: COOKIE_DOMAIN, maxAge: 1000*60*60*24*365 });
    req.cookies = { ...req.cookies, uid };
  }
  next();
});

// Socket.io
io.on('connection', (socket)=>{ console.log('New socket', socket.id); });

// Helper
async function topToday(limit=50){
  const day = dhakaStamp();
  return Score.find({ day }).sort({ points:-1, createdAt:1 }).limit(limit).lean();
}

// Routes
app.post('/api/session', async(req,res)=>{
  try{
    const { nickname } = req.body || {};
    const uid = req.cookies.uid;
    let user = await User.findOne({ uid });
    if(!user) user = await User.create({ uid, nickname: nickname||'Guest' });
    else if(nickname && nickname.trim()){ user.nickname = nickname.trim().slice(0,20); await user.save(); }
    res.json({ ok:true, user:{ uid:user.uid, nickname:user.nickname } });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

app.post('/api/game/start', async(req,res)=>{
  try{
    const uid = req.cookies.uid;
    if(!uid) return res.status(400).json({ ok:false, error:'No UID cookie' });

    const user = await User.findOne({ uid });
    if(!user) return res.status(400).json({ ok:false, error:'No session' });

    const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn:'130s' });
    res.json({ ok:true, token, expiresIn:130 });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

app.post('/api/game/submit', async(req,res)=>{
  try{
    const { token, score } = req.body || {};
    if(!token) return res.status(400).json({ ok:false, error:'Missing token' });

    let payload;
    try{ payload = jwt.verify(token, JWT_SECRET); } 
    catch{ return res.status(401).json({ ok:false, error:'Token invalid/expired' }); }

    if(payload.uid !== req.cookies.uid) return res.status(403).json({ ok:false, error:'Session mismatch' });

    const user = await User.findOne({ uid:payload.uid });
    if(!user) return res.status(400).json({ ok:false, error:'No user' });

    const points = Math.max(0, parseInt(score||0));
    if(!Number.isFinite(points)) return res.status(400).json({ ok:false, error:'Bad score' });

    const day = dhakaStamp(dhakaNow());
    await Score.create({ uid:user.uid, nickname:user.nickname, points, day });

    const board = await topToday(50);
    io.emit('leaderboard:today', board);

    res.json({ ok:true, saved:true });
  } catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

app.get('/api/leaderboard/today', async(_req,res)=>{
  try{ const board = await topToday(50); res.json({ ok:true, board }); }
  catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

server.listen(PORT, '0.0.0.0', ()=>console.log(`Server listening on port ${PORT}`));
