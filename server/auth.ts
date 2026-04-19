/**
 * auth.ts — Multi-restaurant token-based auth
 *
 * Tokens encode the restaurant ID (or "admin") so every request
 * knows which restaurant's data to scope.
 *
 * Token format:  ct-<base64(restaurantId:password)>
 * Admin token:   ct-admin-<base64(ADMIN_PASSWORD)>
 */

import { Request, Response, NextFunction } from "express";
import supabase from "./supabase";

// ── Env config ────────────────────────────────────────────────
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || process.env.APP_PASSWORD || "Magazine315!";

// ── Token helpers ─────────────────────────────────────────────
export function makeRestaurantToken(restaurantId: number): string {
  return "ct-r-" + Buffer.from(String(restaurantId)).toString("base64");
}

export function makeAdminToken(): string {
  return "ct-admin-" + Buffer.from(ADMIN_PASSWORD).toString("base64");
}

export interface AuthContext {
  isAdmin: boolean;
  restaurantId: number | null; // null = admin (sees all)
}

// ── Decode token → AuthContext ────────────────────────────────
export async function decodeToken(token: string): Promise<AuthContext | null> {
  if (!token) return null;

  // Admin token
  if (token === makeAdminToken()) {
    return { isAdmin: true, restaurantId: null };
  }

  // Restaurant token: ct-r-<base64(id)>
  if (token.startsWith("ct-r-")) {
    const idStr = Buffer.from(token.slice(5), "base64").toString("utf8");
    const id = parseInt(idStr, 10);
    if (!isNaN(id) && id > 0) {
      return { isAdmin: false, restaurantId: id };
    }
  }

  // Legacy single-password token (backward compat)
  const legacyPassword = process.env.APP_PASSWORD || "Magazine315!";
  const legacyToken = "ct-" + Buffer.from(legacyPassword).toString("base64");
  if (token === legacyToken) {
    // Treat legacy token as admin
    return { isAdmin: true, restaurantId: null };
  }

  return null;
}

// ── Express middleware ────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/auth/login" || req.path === "/auth/restaurants") return next();

  const token = req.headers["x-auth-token"] as string | undefined;
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const ctx = await decodeToken(token);
  if (!ctx) return res.status(401).json({ error: "Unauthorized" });

  req.auth = ctx;
  next();
}

// ── Login handler ─────────────────────────────────────────────
export async function handleLogin(req: Request, res: Response) {
  const { password, restaurantId } = req.body as { password: string; restaurantId?: number };

  if (!password) return res.status(400).json({ error: "Password required" });

  // Admin login
  if (password === ADMIN_PASSWORD && !restaurantId) {
    return res.json({
      ok: true,
      token: makeAdminToken(),
      isAdmin: true,
      restaurantId: null,
      restaurantName: "Admin",
    });
  }

  // Restaurant login — look up by ID and check password
  if (restaurantId) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, password_hash")
      .eq("id", restaurantId)
      .maybeSingle();

    if (error || !data) return res.status(401).json({ error: "Restaurant not found" });
    if (data.password_hash !== password) return res.status(401).json({ error: "Incorrect password" });

    return res.json({
      ok: true,
      token: makeRestaurantToken(data.id),
      isAdmin: false,
      restaurantId: data.id,
      restaurantName: data.name,
    });
  }

  return res.status(401).json({ error: "Incorrect password" });
}

// ── Get restaurants list (public — for login screen) ──────────
export async function getRestaurants(_req: Request, res: Response) {
  const { data, error } = await supabase
    .from("restaurants")
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
}
