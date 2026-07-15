// Plain TypeScript types replacing the Mongoose model.
// Postgres has no schema-level "model" object - the shape just lives here,
// and UserRepository is responsible for all reads/writes.

export interface User {
  id: string;
  name: string;
  email: string;
  role: "doctor" | "patient" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

// Only used internally by the repository when a query needs the hash
// (e.g. login). Never returned to controllers/clients directly.
export interface UserWithPassword extends User {
  password: string;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string; // plain text in, hashed inside the repository
  role:"doctor" | "patient" | "admin"; // role of the user
}

// Maps a raw `users` table row (snake_case) to the camelCase User shape
// used throughout the app.
export const mapRowToUser = (row: any): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapRowToUserWithPassword = (row: any): UserWithPassword => ({
  ...mapRowToUser(row),
  password: row.password,
});