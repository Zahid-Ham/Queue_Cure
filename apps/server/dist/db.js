"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
// In-memory fallback database for local dev without postgres
class InMemoryDb {
    hospitals = new Map();
    history = [];
    constructor() {
        // Seed default clinic
        this.hospitals.set('clinic-001', {
            id: 'clinic-001',
            name: 'QueueCure Demo Clinic',
            receptionistPin: '1234',
            doctorPin: '5678',
        });
    }
    async getHospital(id) {
        return this.hospitals.get(id) || null;
    }
    async createHospital(id, name, receptionistPin, doctorPin) {
        const hospital = { id, name, receptionistPin, doctorPin };
        this.hospitals.set(id, hospital);
        return hospital;
    }
    async addHistoryEntry(clinicId, token, name, phone, status, addedAt, doneAt) {
        this.history.push({
            clinic_id: clinicId,
            token,
            name,
            phone,
            status,
            added_at: addedAt,
            done_at: doneAt,
            visit_date: new Date().toISOString().split('T')[0]
        });
    }
    async getHistoryByDate(clinicId, dateStr) {
        return this.history
            .filter(h => h.clinic_id === clinicId && h.visit_date === dateStr)
            .map(h => ({
            token: h.token,
            name: h.name,
            phone: h.phone,
            status: h.status,
            addedAt: h.added_at,
            doneAt: h.done_at
        }));
    }
}
let dbInstance;
const hasDbUrl = !!process.env.DATABASE_URL;
if (!hasDbUrl) {
    console.log('No DATABASE_URL found. Using in-memory hospital database fallback.');
    dbInstance = new InMemoryDb();
}
else {
    try {
        const pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: {
                rejectUnauthorized: false // Required for Neon serverless connections
            }
        });
        dbInstance = {
            pool,
            async getHospital(id) {
                const res = await pool.query('SELECT id, name, receptionist_pin AS "receptionistPin", doctor_pin AS "doctorPin" FROM hospitals WHERE id = $1', [id]);
                return res.rows[0] || null;
            },
            async createHospital(id, name, receptionistPin, doctorPin) {
                await pool.query('INSERT INTO hospitals (id, name, receptionist_pin, doctor_pin) VALUES ($1, $2, $3, $4)', [id, name, receptionistPin, doctorPin]);
                return { id, name, receptionistPin, doctorPin };
            },
            async addHistoryEntry(clinicId, token, name, phone, status, addedAt, doneAt) {
                await pool.query('INSERT INTO patient_history (clinic_id, token, name, phone, status, added_at, done_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [clinicId, token, name, phone || null, status, addedAt, doneAt]);
            },
            async getHistoryByDate(clinicId, dateStr) {
                const res = await pool.query('SELECT token, name, phone, status, added_at AS "addedAt", done_at AS "doneAt" FROM patient_history WHERE clinic_id = $1 AND visit_date = $2 ORDER BY done_at ASC', [clinicId, dateStr]);
                return res.rows;
            }
        };
        // Auto-initialize schema
        (async () => {
            try {
                await pool.query(`
          CREATE TABLE IF NOT EXISTS hospitals (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            receptionist_pin CHAR(4) NOT NULL,
            doctor_pin CHAR(4) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS patient_history (
            id SERIAL PRIMARY KEY,
            clinic_id VARCHAR(50) NOT NULL,
            token INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20),
            status VARCHAR(20) NOT NULL,
            added_at BIGINT NOT NULL,
            done_at BIGINT NOT NULL,
            visit_date DATE NOT NULL DEFAULT CURRENT_DATE
          );
        `);
                console.log('PostgreSQL database initialized successfully.');
            }
            catch (err) {
                console.error('Failed to run database schema setup. Falling back to in-memory.', err);
                dbInstance = new InMemoryDb();
            }
        })();
    }
    catch (err) {
        console.error('Postgres pool creation failed. Switching to in-memory DB fallback.', err);
        dbInstance = new InMemoryDb();
    }
}
exports.db = dbInstance;
