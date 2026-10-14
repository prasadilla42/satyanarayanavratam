"use server";

import { revalidatePath } from "next/cache";
import { sendBookingEmail, sendDonationEmail } from "@/lib/bookings";

// These actions are only reachable via /admin, which is protected by src/proxy.ts.

export async function resendBookingEmailAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await sendBookingEmail(id, { force: true });
  revalidatePath("/admin");
}

export async function resendDonationEmailAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (id) await sendDonationEmail(id, { force: true });
  revalidatePath("/admin");
}
