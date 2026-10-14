import nodemailer, { type Transporter } from "nodemailer";
import type { Booking, Donation } from "@prisma/client";
import { EVENT, TICKETS, formatGBP, siteUrl } from "./config";

/* ------------------------------------------------------------------ */
/* Transport (Gmail SMTP using an App Password)                        */
/* ------------------------------------------------------------------ */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transporter;
}

interface Message {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends an email from the organiser's Gmail account.
 * Returns true when sent. If Gmail is not configured the message is logged
 * (handy for local development) and false is returned so callers can retry later.
 */
async function send(message: Message): Promise<boolean> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      "[email] GMAIL_USER / GMAIL_APP_PASSWORD not set – email NOT sent.\n" +
        `  To: ${message.to}\n  Subject: ${message.subject}\n\n${message.text}\n`,
    );
    return false;
  }
  const fromName = process.env.EMAIL_FROM_NAME || EVENT.name;
  const bcc = process.env.ORGANISER_NOTIFY_EMAIL || undefined;
  await t.sendMail({
    from: { name: fromName, address: process.env.GMAIL_USER! },
    replyTo: EVENT.contact.email || process.env.GMAIL_USER,
    to: message.to,
    bcc,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return true;
}

/* ------------------------------------------------------------------ */
/* Template helpers                                                    */
/* ------------------------------------------------------------------ */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#fbf3e4;font-family:Georgia,'Times New Roman',serif;color:#3b1a14;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf3e4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e9d6a8;">
  <tr><td style="background:#6b1220;padding:28px 24px;text-align:center;">
    <div style="color:#f1c65b;font-size:13px;letter-spacing:3px;text-transform:uppercase;">ॐ Sri Satyanarayana Swamy ॐ</div>
    <div style="color:#ffffff;font-size:24px;margin-top:8px;">${esc(title)}</div>
  </td></tr>
  <tr><td style="padding:28px 28px 8px 28px;font-size:16px;line-height:1.55;">${bodyHtml}</td></tr>
  <tr><td style="padding:8px 28px 28px 28px;font-size:13px;color:#7a5a4a;line-height:1.5;">
    ${
      EVENT.contact.email || EVENT.contact.phone
        ? `Questions? Contact ${esc(EVENT.contact.name || "the organisers")}${
            EVENT.contact.email ? ` at ${esc(EVENT.contact.email)}` : ""
          }${EVENT.contact.phone ? ` or ${esc(EVENT.contact.phone)}` : ""}.<br/>`
        : "Questions? Simply reply to this email.<br/>"
    }
    <a href="${siteUrl()}" style="color:#b4530a;">${esc(siteUrl().replace(/^https?:\/\//, ""))}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#7a5a4a;font-size:14px;width:38%;vertical-align:top;">${esc(label)}</td>
    <td style="padding:8px 0;font-size:15px;vertical-align:top;">${value}</td>
  </tr>`;
}

function table(rows: string[]): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f0e2bd;border-bottom:1px solid #f0e2bd;margin:16px 0;">${rows.join("")}</table>`;
}

function timingsHtml(): string {
  if (!EVENT.timings.length) return "To be confirmed – we will email you once finalised.";
  return EVENT.timings.map((t) => `${esc(t.time)} – ${esc(t.label)}`).join("<br/>");
}

function timingsText(): string {
  if (!EVENT.timings.length) return "To be confirmed – we will email you once finalised.";
  return EVENT.timings.map((t) => `${t.time} – ${t.label}`).join("\n          ");
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0;"><a href="${href}" style="display:inline-block;background:#e8730c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-family:Arial,sans-serif;">${esc(label)}</a></p>`;
}

/* ------------------------------------------------------------------ */
/* Booking confirmation                                                */
/* ------------------------------------------------------------------ */

export async function sendBookingConfirmationEmail(b: Booking): Promise<boolean> {
  const tickets: string[] = [];
  if (b.yajamaniQty) tickets.push(`${b.yajamaniQty} × ${TICKETS.yajamani.name}`);
  if (b.generalQty) tickets.push(`${b.generalQty} × ${TICKETS.general.name} (free)`);
  const paid = b.amountPence > 0;
  const link = `${siteUrl()}/confirmation?ref=${encodeURIComponent(b.reference)}&token=${encodeURIComponent(b.accessToken)}`;

  const html = shell(
    "Booking confirmed",
    `<p>Namaste ${esc(b.name)},</p>
     <p>Thank you for registering for <strong>${esc(EVENT.name)}</strong>. Your booking is confirmed — we look forward to welcoming you and your family.</p>
     <div style="background:#fff7e0;border:1px dashed #c9962b;border-radius:10px;padding:14px;text-align:center;margin:18px 0;">
       <div style="font-size:12px;letter-spacing:2px;color:#7a5a4a;text-transform:uppercase;">Booking reference</div>
       <div style="font-size:26px;font-weight:bold;letter-spacing:2px;color:#6b1220;margin-top:4px;">${esc(b.reference)}</div>
     </div>
     ${table([
       row("Tickets", tickets.map(esc).join("<br/>")),
       row("Amount paid", paid ? `<strong>${formatGBP(b.amountPence)}</strong>` : "£0 (free registration)"),
       row("Date", esc(EVENT.dateLong)),
       row("Timings", timingsHtml()),
       row("Venue", `${esc(EVENT.venueName)}<br/>${esc(EVENT.address)}`),
       ...(b.gothram ? [row("Gothram", esc(b.gothram))] : []),
     ])}
     ${button(EVENT.mapsDirectionsUrl, "Get directions")}
     <p style="font-size:14px;color:#7a5a4a;">Please keep your booking reference handy and show this email on arrival. Your booking can also be viewed <a href="${link}" style="color:#b4530a;">here</a>.</p>
     <p>🙏 Om Namo Narayanaya</p>`,
  );

  const text = `Namaste ${b.name},

Your booking for ${EVENT.name} is confirmed.

Booking reference: ${b.reference}
Tickets:           ${tickets.join(", ")}
Amount paid:       ${paid ? formatGBP(b.amountPence) : "£0 (free registration)"}
Date:              ${EVENT.dateLong}
Timings:           ${timingsText()}
Venue:             ${EVENT.venueName}, ${EVENT.address}
Directions:        ${EVENT.mapsDirectionsUrl}

View your booking: ${link}

Om Namo Narayanaya`;

  return send({
    to: b.email,
    subject: `Booking confirmed – ${EVENT.name} (${b.reference})`,
    html,
    text,
  });
}

/* ------------------------------------------------------------------ */
/* Donation receipt                                                    */
/* ------------------------------------------------------------------ */

export async function sendDonationReceiptEmail(d: Donation): Promise<boolean> {
  const html = shell(
    "Thank you for your donation",
    `<p>Namaste ${esc(d.name)},</p>
     <p>Thank you for your generous donation towards <strong>${esc(EVENT.name)}</strong>. Your support helps us host the Vratam for our community.</p>
     <div style="background:#fff7e0;border:1px dashed #c9962b;border-radius:10px;padding:14px;text-align:center;margin:18px 0;">
       <div style="font-size:12px;letter-spacing:2px;color:#7a5a4a;text-transform:uppercase;">Donation reference</div>
       <div style="font-size:26px;font-weight:bold;letter-spacing:2px;color:#6b1220;margin-top:4px;">${esc(d.reference)}</div>
     </div>
     ${table([
       row("Amount", `<strong>${formatGBP(d.amountPence)}</strong>`),
       row("Event", `${esc(EVENT.name)}<br/>${esc(EVENT.dateLong)}`),
       row("Venue", `${esc(EVENT.venueName)}<br/>${esc(EVENT.address)}`),
     ])}
     <p>May Sri Satyanarayana Swamy bless you and your family.</p>
     <p>🙏 Om Namo Narayanaya</p>`,
  );

  const text = `Namaste ${d.name},

Thank you for your donation of ${formatGBP(d.amountPence)} towards ${EVENT.name}.

Donation reference: ${d.reference}
Event: ${EVENT.dateLong}, ${EVENT.venueName}, ${EVENT.address}

Om Namo Narayanaya`;

  return send({
    to: d.email,
    subject: `Thank you for your donation – ${EVENT.name} (${d.reference})`,
    html,
    text,
  });
}
