/**
 * Central place for configuration read from environment secrets.
 * Nothing here returns a fake value: an unset integration reports configured=false
 * and callers show a setup message or a manual fallback.
 */
export const config = {
  demoMode: () => process.env.DEMO_MODE === "true",
  appUrl: () => process.env.APP_URL || "http://localhost:3000",
  timeZone: () => process.env.APP_TIME_ZONE || "America/New_York",
  maps: {
    provider: () => (process.env.MAPS_PROVIDER || (process.env.MAPBOX_TOKEN ? "mapbox" : process.env.GOOGLE_MAPS_API_KEY ? "google" : "none")) as "mapbox" | "google" | "none",
    mapboxToken: () => process.env.MAPBOX_TOKEN,
    mapboxPublicToken: () => process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    googleKey: () => process.env.GOOGLE_MAPS_API_KEY,
  },
  stripe: {
    secretKey: () => process.env.STRIPE_SECRET_KEY,
    publishableKey: () => process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET,
  },
  email: {
    resendKey: () => process.env.RESEND_API_KEY,
    from: () => process.env.EMAIL_FROM,
  },
  sms: {
    twilioSid: () => process.env.TWILIO_ACCOUNT_SID,
    twilioToken: () => process.env.TWILIO_AUTH_TOKEN,
    twilioFrom: () => process.env.TWILIO_FROM_NUMBER,
  },
  push: { webhookUrl: () => process.env.PUSH_WEBHOOK_URL },
  storage: { dir: () => process.env.UPLOAD_DIR || "./storage/uploads" },
  cronSecret: () => process.env.CRON_SECRET,
};

export type IntegrationStatus = {
  key: string;
  name: string;
  configured: boolean;
  detail: string;
  envVars: string[];
};

export function integrationStatuses(): IntegrationStatus[] {
  const maps = config.maps.provider();
  return [
    {
      key: "maps",
      name: "Mapping, geocoding, route distance & ETA",
      configured: maps !== "none" && Boolean(maps === "mapbox" ? config.maps.mapboxToken() : config.maps.googleKey()),
      detail: maps === "none" ? "Manual address entry and manual dispatch are used." : `Using ${maps}.`,
      envVars: ["MAPBOX_TOKEN", "NEXT_PUBLIC_MAPBOX_TOKEN", "or GOOGLE_MAPS_API_KEY"],
    },
    {
      key: "payments",
      name: "Payments (Stripe)",
      configured: Boolean(config.stripe.secretKey() && config.stripe.publishableKey() && config.stripe.webhookSecret()),
      detail: config.stripe.secretKey()?.startsWith("sk_live") ? "LIVE keys detected." : "Test-mode keys expected before launch review.",
      envVars: ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET"],
    },
    {
      key: "email",
      name: "Email (Resend)",
      configured: Boolean(config.email.resendKey() && config.email.from()),
      detail: "Receipts, password resets and status emails.",
      envVars: ["RESEND_API_KEY", "EMAIL_FROM"],
    },
    {
      key: "sms",
      name: "SMS & phone verification (Twilio)",
      configured: Boolean(config.sms.twilioSid() && config.sms.twilioToken() && config.sms.twilioFrom()),
      detail: "Phone verification and SMS status updates.",
      envVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"],
    },
    {
      key: "push",
      name: "Push notifications",
      configured: Boolean(config.push.webhookUrl()),
      detail: "Forwarded to a push gateway (e.g. Expo / FCM relay) for future mobile apps.",
      envVars: ["PUSH_WEBHOOK_URL"],
    },
    {
      key: "storage",
      name: "Document & photo storage",
      configured: true,
      detail: "Private local disk storage. Move to S3-compatible storage before production.",
      envVars: ["UPLOAD_DIR"],
    },
  ];
}
