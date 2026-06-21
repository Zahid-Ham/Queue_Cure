import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { registerEvents } from './events';

const app = express();
const port = process.env.PORT || 4000;
const frontendUrl = process.env.FRONTEND_URL;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
];
if (frontendUrl) {
  allowedOrigins.push(frontendUrl);
}

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Import DB client
import { db } from './db';

app.post('/api/register', async (req, res) => {
  try {
    const { id, name, receptionistPin, doctorPin } = req.body;
    if (!id || !name || !receptionistPin || !doctorPin) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const slug = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const existing = await db.getHospital(slug);
    if (existing) {
      res.status(400).json({ error: 'Hospital ID already exists' });
      return;
    }
    await db.createHospital(slug, name, receptionistPin, doctorPin);
    res.status(201).json({ success: true, hospitalId: slug });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { hospitalId, pin, role } = req.body;
    if (!hospitalId || !pin || !role) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const slug = hospitalId.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const hospital = await db.getHospital(slug);
    if (!hospital) {
      res.status(400).json({ error: 'Hospital ID not found' });
      return;
    }
    
    const pinToMatch = role === 'doctor' ? hospital.doctorPin : hospital.receptionistPin;
    if (pin === pinToMatch) {
      res.status(200).json({ success: true, hospitalId: slug, name: hospital.name });
    } else {
      res.status(400).json({ error: 'Invalid PIN' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  registerEvents(socket, io);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
