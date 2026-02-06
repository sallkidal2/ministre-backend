import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { getAuthUser } from "./auth";
import {
  SendSMSRequestSchema,
  DossierReminderRequestSchema,
  SMSStatusResponseSchema,
  SMSResponseSchema,
  type SMSResponse,
} from "../types";

const smsRouter = new Hono();

// SMS Provider types
type SMSProvider = "twilio" | "africas_talking" | "orange" | "none";

// Orange OAuth2 token cache
let orangeAccessToken: string | null = null;
let orangeTokenExpiry: number = 0;

// Get SMS provider configuration
function getSMSConfig() {
  const provider = (process.env.SMS_PROVIDER || "none") as SMSProvider;

  return {
    provider,
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    },
    africasTalking: {
      apiKey: process.env.AT_API_KEY,
      username: process.env.AT_USERNAME,
      shortcode: process.env.AT_SHORTCODE,
    },
    orange: {
      clientId: process.env.ORANGE_CLIENT_ID,
      clientSecret: process.env.ORANGE_CLIENT_SECRET,
      authHeader: process.env.ORANGE_AUTH_HEADER,
      senderId: process.env.ORANGE_SENDER_ID,
    },
  };
}

// Get Orange OAuth2 access token
async function getOrangeAccessToken(): Promise<string | null> {
  const config = getSMSConfig();
  const { authHeader } = config.orange;

  // Return cached token if still valid (with 60s buffer)
  if (orangeAccessToken && Date.now() < orangeTokenExpiry - 60000) {
    return orangeAccessToken;
  }

  if (!authHeader) {
    console.error("[Orange SMS] Authorization header not configured");
    return null;
  }

  try {
    console.log("[Orange SMS] Fetching new access token...");

    const response = await fetch("https://api.orange.com/oauth/v3/token", {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Orange SMS] Token request failed:", response.status, errorText);
      return null;
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    orangeAccessToken = data.access_token;
    orangeTokenExpiry = Date.now() + (data.expires_in * 1000);

    console.log("[Orange SMS] Access token obtained, expires in", data.expires_in, "seconds");

    return orangeAccessToken;
  } catch (error) {
    console.error("[Orange SMS] Error fetching token:", error);
    return null;
  }
}

// Normalize Mali phone numbers to +223 prefix
function normalizeMaliPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If starts with 00223, replace with +223
  if (cleaned.startsWith("00223")) {
    cleaned = "+223" + cleaned.slice(5);
  }
  // If starts with 223 (no +), add +
  else if (cleaned.startsWith("223") && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  // If starts with 0 (local Mali number), replace with +223
  else if (cleaned.startsWith("0") && cleaned.length === 9) {
    cleaned = "+223" + cleaned.slice(1);
  }
  // If it's just 8 digits (Mali mobile), add +223
  else if (/^\d{8}$/.test(cleaned)) {
    cleaned = "+223" + cleaned;
  }
  // If doesn't start with +, assume Mali and add +223
  else if (!cleaned.startsWith("+") && cleaned.length >= 8) {
    cleaned = "+223" + cleaned;
  }

  return cleaned;
}

// Log SMS attempt for debugging
function logSMSAttempt(provider: string, to: string, message: string, success: boolean, error?: string) {
  const timestamp = new Date().toISOString();
  console.log(`[SMS ${timestamp}] Provider: ${provider}, To: ${to}, Success: ${success}${error ? `, Error: ${error}` : ""}`);
  console.log(`[SMS ${timestamp}] Message: ${message.substring(0, 100)}${message.length > 100 ? "..." : ""}`);
}

// Send SMS via Twilio
async function sendViaTwilio(to: string, message: string): Promise<SMSResponse> {
  const config = getSMSConfig();
  const { accountSid, authToken, fromNumber } = config.twilio;

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Configuration Twilio incomplete" };
  }

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          To: to,
          From: fromNumber,
          Body: message,
        }),
      }
    );

    const data = (await response.json()) as { sid?: string; message?: string };

    if (response.ok) {
      logSMSAttempt("twilio", to, message, true);
      return { success: true, messageId: data.sid };
    } else {
      const errorMsg = data.message || "Erreur Twilio inconnue";
      logSMSAttempt("twilio", to, message, false, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Erreur Twilio";
    logSMSAttempt("twilio", to, message, false, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Send SMS via Africa's Talking
async function sendViaAfricasTalking(to: string, message: string): Promise<SMSResponse> {
  const config = getSMSConfig();
  const { apiKey, username, shortcode } = config.africasTalking;

  if (!apiKey || !username) {
    return { success: false, error: "Configuration Africa's Talking incomplete" };
  }

  try {
    const response = await fetch("https://api.africastalking.com/version1/messaging", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        apiKey: apiKey,
      },
      body: new URLSearchParams({
        username: username,
        to: to,
        message: message,
        ...(shortcode ? { from: shortcode } : {}),
      }),
    });

    const data = (await response.json()) as {
      SMSMessageData?: {
        Recipients?: Array<{ status: string; messageId: string }>;
        Message?: string;
      };
    };

    if (data.SMSMessageData?.Recipients?.[0]?.status === "Success") {
      logSMSAttempt("africas_talking", to, message, true);
      return { success: true, messageId: data.SMSMessageData.Recipients[0].messageId };
    } else {
      const errorMsg = data.SMSMessageData?.Message || "Erreur Africa's Talking";
      logSMSAttempt("africas_talking", to, message, false, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Erreur Africa's Talking";
    logSMSAttempt("africas_talking", to, message, false, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Send SMS via Orange
async function sendViaOrange(to: string, message: string): Promise<SMSResponse> {
  const config = getSMSConfig();
  const { senderId } = config.orange;

  // Get OAuth2 access token
  const accessToken = await getOrangeAccessToken();

  if (!accessToken) {
    return { success: false, error: "Impossible d'obtenir le token Orange. Verifiez la configuration." };
  }

  try {
    // Format phone number for Orange API (remove + for the URL)
    const phoneForUrl = to.replace("+", "");

    // Orange SMS API (Mali) - using the dev/test endpoint
    const apiUrl = `https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B223/requests`;

    console.log(`[Orange SMS] Sending to ${to} via ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: `tel:${to}`,
          senderAddress: "tel:+223",
          outboundSMSTextMessage: {
            message: message,
          },
        },
      }),
    });

    const responseText = await response.text();
    console.log(`[Orange SMS] Response status: ${response.status}`);
    console.log(`[Orange SMS] Response body: ${responseText}`);

    let data: {
      outboundSMSMessageRequest?: { resourceURL?: string };
      requestError?: { serviceException?: { text?: string; messageId?: string } };
    } = {};

    try {
      data = JSON.parse(responseText);
    } catch {
      // Response might not be JSON
    }

    if (response.ok) {
      logSMSAttempt("orange", to, message, true);
      return { success: true, messageId: data.outboundSMSMessageRequest?.resourceURL };
    } else {
      const errorMsg = data.requestError?.serviceException?.text || `Erreur Orange (${response.status})`;
      logSMSAttempt("orange", to, message, false, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Erreur Orange";
    logSMSAttempt("orange", to, message, false, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Main SMS sending function
async function sendSMS(to: string, message: string): Promise<SMSResponse> {
  const config = getSMSConfig();
  const normalizedTo = normalizeMaliPhoneNumber(to);

  switch (config.provider) {
    case "twilio":
      return sendViaTwilio(normalizedTo, message);
    case "africas_talking":
      return sendViaAfricasTalking(normalizedTo, message);
    case "orange":
      return sendViaOrange(normalizedTo, message);
    case "none":
    default:
      logSMSAttempt("none", normalizedTo, message, false, "Aucun fournisseur SMS configure");
      return { success: false, error: "Aucun fournisseur SMS configure. Contactez l'administrateur." };
  }
}

// Format dossier deadline reminder message in French
function formatDossierReminderMessage(
  dossierTitle: string,
  deadline: string,
  progress: number
): string {
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let urgencyText = "";
  if (daysUntilDeadline < 0) {
    urgencyText = `URGENT: Le delai est depasse de ${Math.abs(daysUntilDeadline)} jour(s)!`;
  } else if (daysUntilDeadline === 0) {
    urgencyText = "URGENT: Le delai expire aujourd'hui!";
  } else if (daysUntilDeadline === 1) {
    urgencyText = "ATTENTION: Le delai expire demain!";
  } else if (daysUntilDeadline <= 3) {
    urgencyText = `Rappel: Il reste ${daysUntilDeadline} jours avant l'echeance.`;
  } else {
    urgencyText = `Rappel: Echeance dans ${daysUntilDeadline} jours.`;
  }

  const formattedDate = deadlineDate.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `${urgencyText}\n\nDossier: ${dossierTitle}\nEcheance: ${formattedDate}\nProgression: ${progress}%\n\nMerci de traiter ce dossier dans les delais.`;
}

// POST /api/sms/send - Send an SMS (admin only)
smsRouter.post("/send", zValidator("json", SendSMSRequestSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only admins can send SMS
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Acces refuse. Reservee aux administrateurs.", code: "FORBIDDEN" } }, 403);
  }

  const { to, message } = c.req.valid("json");

  const result = await sendSMS(to, message);

  if (result.success) {
    return c.json({ data: result });
  } else {
    return c.json({ data: result }, 400);
  }
});

// POST /api/sms/dossier-reminder - Send a dossier deadline reminder SMS
smsRouter.post("/dossier-reminder", zValidator("json", DossierReminderRequestSchema), async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  // Only admins can send reminders
  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN_DEPARTMENT") {
    return c.json({ error: { message: "Acces refuse. Reservee aux administrateurs.", code: "FORBIDDEN" } }, 403);
  }

  const { dossierId, phone, dossierTitle, deadline, progress } = c.req.valid("json");

  // Format the reminder message
  const message = formatDossierReminderMessage(dossierTitle, deadline, progress);

  console.log(`[SMS] Sending dossier reminder for dossier ${dossierId} to ${phone}`);

  const result = await sendSMS(phone, message);

  if (result.success) {
    return c.json({ data: result });
  } else {
    return c.json({ data: result }, 400);
  }
});

// GET /api/sms/status - Check if SMS is configured
smsRouter.get("/status", async (c) => {
  const user = await getAuthUser(c);

  if (!user) {
    return c.json({ error: { message: "Non authentifie", code: "UNAUTHORIZED" } }, 401);
  }

  const config = getSMSConfig();
  let configured = false;

  switch (config.provider) {
    case "twilio":
      configured = !!(config.twilio.accountSid && config.twilio.authToken && config.twilio.fromNumber);
      break;
    case "africas_talking":
      configured = !!(config.africasTalking.apiKey && config.africasTalking.username);
      break;
    case "orange":
      configured = !!config.orange.authHeader;
      break;
    case "none":
    default:
      configured = false;
  }

  return c.json({
    data: {
      configured,
      provider: config.provider,
    },
  });
});

export { smsRouter };
