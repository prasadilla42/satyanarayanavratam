import { connection } from "next/server";
import { getAvailability } from "@/lib/bookings";

export async function GET() {
  await connection(); // always computed at request time, never prerendered
  try {
    const availability = await getAvailability();
    return Response.json(availability, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/availability] failed", err);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
