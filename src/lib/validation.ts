import { z } from "zod";
import {
  DONATION_MAX_PENCE,
  DONATION_MIN_PENCE,
  MAX_PER_BOOKING,
} from "./config";

const name = z
  .string()
  .trim()
  .min(2, "Please enter your full name")
  .max(100, "Name is too long");

const email = z
  .string()
  .trim()
  .max(200, "Email is too long")
  .pipe(z.email("Please enter a valid email address"));

const phone = z
  .string()
  .trim()
  .max(30, "Phone number is too long")
  .refine((v) => /^[+\d][\d\s().-]*$/.test(v), "Please enter a valid phone number")
  .refine((v) => {
    const digits = v.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, "Please enter a valid phone number");

const qty = z
  .number({ error: "Enter a valid number" })
  .int("Enter a whole number")
  .min(0)
  .max(MAX_PER_BOOKING, `Maximum ${MAX_PER_BOOKING} per booking`);

export const bookingSchema = z
  .object({
    name,
    email,
    phone,
    gothram: z.string().trim().max(100).optional().default(""),
    notes: z.string().trim().max(500, "Please keep notes under 500 characters").optional().default(""),
    yajamaniQty: qty,
    generalQty: qty,
    /** Honeypot – real visitors never fill this in */
    website: z.string().max(0).optional().default(""),
  })
  .refine((v) => v.yajamaniQty + v.generalQty > 0, {
    message: "Please select at least one ticket",
    path: ["yajamaniQty"],
  });

export type BookingInput = z.infer<typeof bookingSchema>;

export const donationSchema = z.object({
  name,
  email,
  amountPence: z
    .number({ error: "Enter a valid amount" })
    .int()
    .min(DONATION_MIN_PENCE, "Minimum donation is £1")
    .max(DONATION_MAX_PENCE, "Please contact the organisers for larger donations"),
  message: z.string().trim().max(300, "Please keep your message under 300 characters").optional().default(""),
  website: z.string().max(0).optional().default(""),
});

export type DonationInput = z.infer<typeof donationSchema>;

/** Flatten Zod issues to { field: firstMessage } */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
