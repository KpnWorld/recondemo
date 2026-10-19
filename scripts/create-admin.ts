/**
 * Create the first SUPER_ADMIN for a non-demo deployment.
 *   ADMIN_PASSWORD='a-long-password' npm run create-admin -- owner@example.com "Owner Name"
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, name] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD;
if (!email || !name || !password || password.length < 12) {
  console.error('Usage: ADMIN_PASSWORD="12+ chars" npm run create-admin -- <email> "<name>"');
  process.exit(1);
}
const db = new PrismaClient();
db.user
  .create({ data: { email: email.toLowerCase(), name, role: "ADMIN", adminRole: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12), termsAcceptedAt: new Date() } })
  .then((u) => console.log("Created super admin", u.email))
  .finally(() => db.$disconnect());
