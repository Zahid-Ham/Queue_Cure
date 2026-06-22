"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const events_1 = require("./events");
const app = (0, express_1.default)();
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
app.use((0, cors_1.default)({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express_1.default.json());
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
app.get('/', (req, res) => {
    res.status(200).json({ status: 'successful', message: 'QueueCure Backend Service is active and online' });
});
// Import DB client
const db_1 = require("./db");
app.get('/api/history', async (req, res) => {
    try {
        const { clinicId, date } = req.query;
        if (!clinicId || !date) {
            res.status(400).json({ error: 'Missing required query parameters: clinicId and date' });
            return;
        }
        const history = await db_1.db.getHistoryByDate(String(clinicId), String(date));
        res.status(200).json(history);
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});
app.post('/api/register', async (req, res) => {
    try {
        const { id, name, receptionistPin, doctorPin } = req.body;
        if (!id || !name || !receptionistPin || !doctorPin) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const slug = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const existing = await db_1.db.getHospital(slug);
        if (existing) {
            res.status(400).json({ error: 'Hospital ID already exists' });
            return;
        }
        await db_1.db.createHospital(slug, name, receptionistPin, doctorPin);
        res.status(201).json({ success: true, hospitalId: slug });
    }
    catch (err) {
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
        const hospital = await db_1.db.getHospital(slug);
        if (!hospital) {
            res.status(400).json({ error: 'Hospital ID not found' });
            return;
        }
        const pinToMatch = role === 'doctor' ? hospital.doctorPin : hospital.receptionistPin;
        if (pin === pinToMatch) {
            res.status(200).json({ success: true, hospitalId: slug, name: hospital.name });
        }
        else {
            res.status(400).json({ error: 'Invalid PIN' });
        }
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
});
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    (0, events_1.registerEvents)(socket, io);
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});
httpServer.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
