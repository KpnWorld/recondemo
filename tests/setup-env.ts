process.env.DATABASE_URL = "file:./test.db";
process.env.DEMO_MODE = "true";
process.env.UPLOAD_DIR = "./storage/test-uploads";
process.env.APP_URL = "http://localhost:3000";
for (const k of ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "MAPBOX_TOKEN", "GOOGLE_MAPS_API_KEY", "RESEND_API_KEY", "TWILIO_ACCOUNT_SID"])
  delete process.env[k];
