import jwt from "jsonwebtoken";

const ACCESS_SECRET = process.env.JWT_SECRET!;
const REFRESH_SECRET = process.env.REFRESH_SECRET!;

export const generateAccessToken = (userId: string, email: string, role:string) => {
  return jwt.sign(
    { id: userId, email,role },
    ACCESS_SECRET,
    {
      expiresIn: "30m",
    }
  );
};

export const generateRefreshToken = (userId: string, email: string, role:string) => {
  return jwt.sign(
    { id: userId, email, role },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
    }
  );
};