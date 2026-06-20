/**
 * Initializes the Railway PostgreSQL database with all tables and seed data.
 * Usage: $env:DATABASE_URL="postgresql://..." ; node scripts/init-db.js
 */

require('dotenv').config()
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'biotrack',
        user: process.env.DB_USER || 'biotrack_user',
        password: process.env.DB_PASSWORD,
      },
)

async function run() {
  const client = await pool.connect()
  try {
    console.log('Connected to database. Creating tables...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                 SERIAL PRIMARY KEY,
        first_name         VARCHAR(100) NOT NULL,
        last_name          VARCHAR(100) NOT NULL,
        email              VARCHAR(255) NOT NULL UNIQUE,
        password_hash      VARCHAR(255) NOT NULL,
        role               VARCHAR(50)  NOT NULL,
        email_verified     BOOLEAN      NOT NULL DEFAULT false,
        status             VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        verification_token VARCHAR(255),
        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS health_profiles (
        id                     SERIAL PRIMARY KEY,
        user_id                INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        height_cm              NUMERIC(5,1),
        weight_kg              NUMERIC(5,2),
        goal_weight_kg         NUMERIC(5,2),
        activity_level         VARCHAR(20),
        nutritional_objective  VARCHAR(30),
        dietary_restrictions   TEXT,
        age                    INTEGER,
        biological_sex         VARCHAR(10),
        systolic_pressure      INTEGER,
        diastolic_pressure     INTEGER,
        glucose_mg_dl          NUMERIC(6,2),
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS nutritional_plans (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        calorie_target  INTEGER,
        protein_grams   INTEGER,
        carbs_grams     INTEGER,
        fat_grams       INTEGER,
        status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVATED',
        nutritionist_id INTEGER REFERENCES users(id),
        patient_id      INTEGER REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS plan_assignments (
        id              SERIAL PRIMARY KEY,
        plan_id         INTEGER NOT NULL REFERENCES nutritional_plans(id) ON DELETE CASCADE,
        patient_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        nutritionist_id INTEGER NOT NULL REFERENCES users(id),
        assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(plan_id, patient_id)
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS food_entries (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        meal_type  VARCHAR(50),
        food_name  VARCHAR(255),
        calories   NUMERIC(8,2),
        logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_entries (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        activity_type    VARCHAR(100),
        duration_minutes INTEGER,
        calories_burned  INTEGER,
        logged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS weight_records (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        weight_kg   NUMERIC(5,2) NOT NULL,
        notes       TEXT,
        type        VARCHAR(20) DEFAULT 'PROGRESS',
        source      VARCHAR(20) DEFAULT 'MANUAL',
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id             SERIAL PRIMARY KEY,
        name           VARCHAR(100) NOT NULL,
        monthly_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        is_active      BOOLEAN NOT NULL DEFAULT true
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan_id           INTEGER NOT NULL REFERENCES subscription_plans(id),
        status            INTEGER NOT NULL DEFAULT 1,
        start_date        DATE NOT NULL,
        next_billing_date DATE,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id              SERIAL PRIMARY KEY,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        payment_date    DATE NOT NULL,
        amount          NUMERIC(10,2) NOT NULL,
        status          INTEGER NOT NULL DEFAULT 1,
        transaction_id  VARCHAR(100),
        gateway_message TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id              SERIAL PRIMARY KEY,
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        issued_date     DATE NOT NULL,
        due_date        DATE NOT NULL,
        amount          NUMERIC(10,2) NOT NULL,
        is_paid         BOOLEAN NOT NULL DEFAULT false,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        ruc        VARCHAR(20)  NOT NULL UNIQUE,
        sector     VARCHAR(100),
        country    VARCHAR(100),
        city       VARCHAR(100),
        status     VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        owner_id   INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS collaborators (
        id              SERIAL PRIMARY KEY,
        company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        first_name      VARCHAR(100),
        last_name       VARCHAR(100),
        email           VARCHAR(255),
        document_number VARCHAR(50),
        status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
      )
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id                SERIAL PRIMARY KEY,
        nutritionist_id   INTEGER NOT NULL,
        patient_id        INTEGER NOT NULL,
        consultation_date DATE NOT NULL,
        topic             VARCHAR(255),
        notes             TEXT,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    console.log('Tables created. Seeding data...')

    // Subscription plans
    await client.query(`
      INSERT INTO subscription_plans (name, monthly_amount, is_active) VALUES
        ('Basico',       0.00, true),
        ('Profesional', 29.99, true),
        ('Premium',     59.99, true)
      ON CONFLICT DO NOTHING
    `)

    // Test users
    const hash = await bcrypt.hash('Pass1234!', 10)

    const nutritionistRes = await client.query(`
      INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified, status)
      VALUES ('Carlos', 'Lopez', 'carlos@biotrack.com', $1, 'NUTRICIONISTA', true, 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [hash])
    const nutritionistId = nutritionistRes.rows[0].id

    const patientRes = await client.query(`
      INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified, status)
      VALUES ('Sofia', 'Diaz', 'sofia_test2@gmail.com', $1, 'PACIENTE', true, 'ACTIVE')
      ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `, [hash])
    const patientId = patientRes.rows[0].id

    console.log(`Nutritionist id=${nutritionistId}, Patient id=${patientId}`)

    // Health profile for Sofia
    await client.query(`
      INSERT INTO health_profiles (user_id, height_cm, weight_kg, goal_weight_kg, activity_level, nutritional_objective, age, biological_sex)
      VALUES ($1, 162, 58.5, 55.0, 'MODERATE', 'LOSE_WEIGHT', 24, 'FEMALE')
      ON CONFLICT (user_id) DO NOTHING
    `, [patientId])

    // Nutritional plan assigned to Sofia
    const planRes = await client.query(`
      INSERT INTO nutritional_plans (name, calorie_target, protein_grams, carbs_grams, fat_grams, status, nutritionist_id, patient_id)
      VALUES ('Plan de pérdida de peso', 1700, 130, 180, 55, 'ACTIVATED', $1, $2)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [nutritionistId, patientId])

    if (planRes.rows.length) {
      const planId = planRes.rows[0].id
      await client.query(`
        INSERT INTO plan_assignments (plan_id, patient_id, nutritionist_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (plan_id, patient_id) DO NOTHING
      `, [planId, patientId, nutritionistId])
    }

    // Sample food entries for Sofia (today)
    const today = new Date().toISOString().slice(0, 10)
    await client.query(`
      INSERT INTO food_entries (user_id, meal_type, food_name, calories, logged_at)
      VALUES
        ($1, 'breakfast', 'Avena con leche', 320, $2::date + interval '7 hours'),
        ($1, 'lunch',     'Arroz con pollo', 520, $2::date + interval '13 hours'),
        ($1, 'snack',     'Manzana',          80, $2::date + interval '16 hours')
      ON CONFLICT DO NOTHING
    `, [patientId, today])

    // Sample weight records
    await client.query(`
      INSERT INTO weight_records (user_id, weight_kg, notes, recorded_at)
      VALUES
        ($1, 60.0, 'Peso inicial', NOW() - interval '30 days'),
        ($1, 59.2, '',             NOW() - interval '15 days'),
        ($1, 58.5, '',             NOW())
      ON CONFLICT DO NOTHING
    `, [patientId])

    // Sample consultation
    await client.query(`
      INSERT INTO consultations (nutritionist_id, patient_id, consultation_date, topic, notes)
      VALUES ($1, $2, $3, 'Primera consulta', 'Se estableció plan nutricional inicial.')
      ON CONFLICT DO NOTHING
    `, [nutritionistId, patientId, today])

    console.log('Database initialized successfully.')
  } catch (err) {
    console.error('Error initializing database:', err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()
