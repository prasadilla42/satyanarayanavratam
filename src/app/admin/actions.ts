"use server";

import { revalidatePath } from "next/cache";
import {
  adminCancelBooking,
  adminDeleteBooking,
  adminDeleteDonation,
  sendBookingEmail,
  sendDonationEmail,
  setCapacities,
  type AdminResult,
} from "@/lib/bookings";

// These actions are only reachable via /admin, which is protected by src/proxy.ts.

const idOf = (formData: FormData) => String(formData.get("id") ?? "");

export async function resendBookingEmailAction(formData: FormData) {
  const id = idOf(formData);
  if (id) await sendBookingEmail(id, { force: true });
  revalidatePath("/admin");
}

export async function resendDonationEmailAction(formData: FormData) {
  const id = idOf(formData);
  if (id) await sendDonationEmail(id, { force: true });
  revalidatePath("/admin");
}

export async function cancelBookingAction(formData: FormData) {
  const id = idOf(formData);
  if (id) await adminCancelBooking(id);
  revalidatePath("/admin");
}

export async function deleteBookingAction(formData: FormData) {
  const id = idOf(formData);
  if (id) await adminDeleteBooking(id);
  revalidatePath("/admin");
}

export async function deleteDonationAction(formData: FormData) {
  const id = idOf(formData);
  if (id) await adminDeleteDonation(id);
  revalidatePath("/admin");
}

export async function updateCapacityAction(_prev: AdminResult | null, formData: FormData): Promise<AdminResult> {
  const yajamani = Number(String(formData.get("yajamani") ?? "").trim());
  const general = Number(String(formData.get("general") ?? "").trim());
  const result = await setCapacities(yajamani, general);
  if (result.ok) revalidatePath("/admin");
  return result;
}
