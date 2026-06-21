import { Pool } from 'pg';

export interface Hospital {
  id: string;
  name: string;
  receptionistPin: string;
  doctorPin: string;
}

// In-memory fallback database for local dev without postgres
class InMemoryDb {
  private hospitals: Map<string, Hospital> = new Map();

  constructor() {
    // Seed default clinic
    this.hospitals.set('clinic-001', {
      id: 'clinic-001',
      name: 'QueueCure Demo Clinic',
      receptionistPin: '1234',
      doctorPin: '5678',
    });
  }

  async getHospital(id: string): Promise<Hospital | null> {
    return this.hospitals.get(id) || null;
  }

  async createHospital(id: string, name: string, receptionistPin: string, doctorPin: string): Promise<Hospital> {
    const hospital: Hospital = { id, name, receptionistPin, doctorPin };
    this.hospitals.set(id, hospital);
    return hospital;
  }
}

let dbInstance: any;
const hasDbUrl = !!process.env.DATABASE_URL;

if (!hasDbUrl) {
  console.log('No DATABASE_URL found. Using in-memory hospital database fallback.');
  dbInstance = new InMemoryDb();
} else {
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false // Required for Neon serverless connections
      }
    });

    dbInstance = {
      pool,
      async getHospital(id: string): Promise<Hospital | null> {
        const res = await pool.query(
          'SELECT id, name, receptionist_pin AS "receptionistPin", doctor_pin AS "doctorPin" FROM hospitals WHERE id = $1',
          [id]
        );
        return res.rows[0] || null;
      },
      async createHospital(id: string, name: string, receptionistPin: string, doctorPin: string): Promise<Hospital> {
        await pool.query(
          'INSERT INTO hospitals (id, name, receptionist_pin, doctor_pin) VALUES ($1, $2, $3, $4)',
          [id, name, receptionistPin, doctorPin]
        );
        return { id, name, receptionistPin, doctorPin };
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
        `);
        console.log('PostgreSQL database initialized successfully.');
      } catch (err) {
        console.error('Failed to run database schema setup. Falling back to in-memory.', err);
        dbInstance = new InMemoryDb();
      }
    })();

  } catch (err) {
    console.error('Postgres pool creation failed. Switching to in-memory DB fallback.', err);
    dbInstance = new InMemoryDb();
  }
}

export const db = dbInstance;
