import { db } from './index.ts';
import { users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db.insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error("Failed to get or create user in DB:", error);
    try {
      const existing = await db.select().from(users).where(eq(users.uid, uid));
      if (existing.length > 0) {
        return existing[0];
      }
    } catch (selError) {
      console.error("Select fallback failed:", selError);
    }
    throw new Error("User database synchronization failed.", { cause: error });
  }
}
