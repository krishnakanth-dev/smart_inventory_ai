import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken & { dbId: number };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    
    // Synchronize or find the authenticated user in PostgreSQL
    const dbUser = await getOrCreateUser(decodedToken.uid, decodedToken.email || 'no-email@example.com');
    
    req.user = {
      ...decodedToken,
      dbId: dbUser.id,
    };
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token in Express middleware:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
