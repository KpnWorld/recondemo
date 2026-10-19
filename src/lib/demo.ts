// Shared demo credentials (demo environment only; see prisma/seed.ts).
export const DEMO_PASSWORD = "CallRecon-demo-2026";
export const DEMO_ACCOUNTS = [
  {
    email: "customer@demo.callrecon.test",
    label: "Customer",
    detail: "Casey: request a tow and track it",
  },
  {
    email: "driver.bayside@demo.callrecon.test",
    label: "Tow provider",
    detail: "Bayside Towing: flatbed, online",
  },
  {
    email: "driver.harbor@demo.callrecon.test",
    label: "Roadside provider",
    detail: "Harbor Roadside: jump, tire, lockout, fuel",
  },
  {
    email: "driver.pending@demo.callrecon.test",
    label: "Unverified provider",
    detail: "Awaiting admin approval",
  },
  {
    email: "admin@demo.callrecon.test",
    label: "Super admin",
    detail: "Full access",
  },
  {
    email: "dispatch@demo.callrecon.test",
    label: "Dispatcher",
    detail: "Assign providers, manage requests",
  },
  {
    email: "finance@demo.callrecon.test",
    label: "Finance",
    detail: "Payments, refunds, payouts",
  },
  {
    email: "support@demo.callrecon.test",
    label: "Support",
    detail: "Tickets and request lookup",
  },
];
