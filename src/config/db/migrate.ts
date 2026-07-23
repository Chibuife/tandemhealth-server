import { readFileSync } from "fs";
import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const {
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
} = process.env;

if (!DB_HOST || !DB_USER || !DB_NAME) {
    throw new Error("PostgreSQL environment variables are not configured.");
}
const DATABASE_URL =
  `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=require`;

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// async function migrate() {
//     const sql = readFileSync("src/config/db/schema.sql", "utf8");

//     await pool.query(sql);

//     console.log("✅ Schema created successfully");

//     await pool.end();
// }

// migrate().catch((err) => {
//     console.error(err);
//     process.exit(1);
// });

async function migrate() {
  const sql = readFileSync(
    "src/config/db/002_add_meeting_columns.sql",
    "utf8"
  );

  await pool.query(sql);

  console.log("✅ Migration completed");

  await pool.end();
}

migrate().catch(console.error);