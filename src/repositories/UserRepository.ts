import bcrypt from "bcrypt";
import { pool } from "../config/db/index.js";
import {
  User,
  UserWithPassword,
  CreateUserInput,
  mapRowToUser,
  mapRowToUserWithPassword,
} from "../models/User.js";

const SALT_ROUNDS = 10;

export const UserRepository = {
  /**
   * Fetch a user by id, but only if the requester (ownerId) is that same
   * user. Mirrors the access-control intent of the original method name.
   * Password hash is never selected here.
   */
  async findUserByIdForOwner(
    id: string,
    ownerId: string
  ): Promise<User | null> {
    if (id !== ownerId) {
      return null;
    }

    const result = await pool.query(
      `SELECT id, name, email, role, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapRowToUser(result.rows[0]);
  },

  /**
   * Used for login - includes the password hash so it can be compared.
   * Never expose this result directly to a client response.
   */
  async findByEmailWithPassword(
    email: string
  ): Promise<UserWithPassword | null> {
    const result = await pool.query(
      `SELECT id, name, email, password, role, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapRowToUserWithPassword(result.rows[0]);
  },

  async findByEmail(email: string): Promise<User | null> {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at, updated_at
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapRowToUser(result.rows[0]);
  },

  async create(input: CreateUserInput): Promise<User> {
    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at, updated_at`,
      [input.name, input.email, hashedPassword, input.role]
    );

    return mapRowToUser(result.rows[0]);
  },

  async comparePassword(
    plainPassword: string,
    hashedPassword: string
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  },

  async listDoctors(filters?: { search?: string }): Promise<User[]> {
    const conditions: string[] = [`role = 'doctor'`];
    const values: string[] = [];

    if (filters?.search) {
      values.push(`%${filters.search}%`);
      conditions.push(`(name ILIKE $${values.length} OR email ILIKE $${values.length})`);
    }

    const result = await pool.query(
      `SELECT id, name, email, role, created_at, updated_at
     FROM users
     WHERE ${conditions.join(" AND ")}
     ORDER BY name ASC`,
      values
    );

    return result.rows.map(mapRowToUser);
  },

  async findDoctorById(id: string): Promise<User | null> {
    const result = await pool.query(
      `SELECT id, name, email, role, created_at, updated_at
     FROM users
     WHERE id = $1 AND role = 'doctor'`,
      [id]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return mapRowToUser(result.rows[0]);
  },
};