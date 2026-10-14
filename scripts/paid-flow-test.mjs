// Tests the paid-booking path WITHOUT real Stripe keys by:
//   - seeding bookings straight into the database, and
//   - sending correctly signed fake Stripe webhook events.
// Requires in .env:  STRIPE_SECRET_KEY=sk_test_dummy   STRIPE_WEBHOOK_SECRET=whsec_localtest
//   node scripts/paid-flow-test.mjs [baseUrl]
import { createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] || "http://localhost:3000";
const secret = "whsec_localtest";
const db = new PrismaClient();
const run = String(Math.floor(1000 + Math.random() * 9000));
let failures = 0;
let seq = 0;

const check = (name, cond, extra) => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
};

async function webhook(type, session) {
  const payload = JSON.stringify({
    id: `evt_${randomBytes(6).toString("hex")}`,
    object: "event",
    type,
    data: { object: session },
  });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const res = await fetch(base + "/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}`, "content-type": "application/json" },
    body: payload,
  });
  return res.status;
}

async function seed({ yaj = 0, gen = 0, status = "PENDING", minutes = 36 }) {
  const n = ++seq;
  const id = `${run}${n}`;
  return db.booking.create({
    data: {
      reference: `TEST-${id}`,
      accessToken: `tok-${id}-${randomBytes(4).toString("hex")}`,
      status,
      name: `Paid Tester ${id}`,
      email: `paid${id}@example.com`,
      phone: `0771${id}`,
      emailKey: `paid${id}@example.com`,
      phoneKey: `771${id}`,
      yajamaniQty: yaj,
      generalQty: gen,
      amountPence: yaj * 5100,
      stripeSessionId: `cs_test_${id}`,
      expiresAt: status === "PENDING" ? new Date(Date.now() + minutes * 60_000) : null,
    },
  });
}

const sessionFor = (b, over = {}) => ({
  id: b.stripeSessionId,
  object: "checkout.session",
  payment_status: "paid",
  status: "complete",
  amount_total: b.amountPence,
  currency: "gbp",
  payment_intent: `pi_${b.id}`,
  metadata: { kind: "booking", bookingId: b.id, reference: b.reference },
  ...over,
});

const avail = async () => (await fetch(base + "/api/availability")).json();

console.log("webhook security");
let status = await fetch(base + "/api/webhooks/stripe", { method: "POST", body: "{}" }).then((r) => r.status);
check("missing signature rejected (400)", status === 400, status);
status = await fetch(base + "/api/webhooks/stripe", {
  method: "POST",
  headers: { "stripe-signature": "t=1,v1=bad" },
  body: "{}",
}).then((r) => r.status);
check("bad signature rejected (400)", status === 400, status);

console.log("pending booking holds seats, payment confirms it");
const before = await avail();
const b1 = await seed({ yaj: 2 });
let a = await avail();
check("pending booking holds 2 Yajamani seats", a.yajamani.taken === before.yajamani.taken + 2, a.yajamani);
check("webhook accepted", (await webhook("checkout.session.completed", sessionFor(b1))) === 200);
let got = await db.booking.findUnique({ where: { id: b1.id } });
check("booking CONFIRMED + paidAt set", got.status === "CONFIRMED" && got.paidAt, got);
check("paymentIntentId stored", got.paymentIntentId === `pi_${b1.id}`, got.paymentIntentId);
console.log("  (email: not sent unless GMAIL_USER / GMAIL_APP_PASSWORD are set; see server log)");
check("webhook replay is idempotent", (await webhook("checkout.session.completed", sessionFor(b1))) === 200);
a = await avail();
check("seats not double counted", a.yajamani.taken === before.yajamani.taken + 2, a.yajamani);

console.log("amount tampering");
const b2 = await seed({ yaj: 1 });
await webhook("checkout.session.completed", sessionFor(b2, { amount_total: 100 }));
got = await db.booking.findUnique({ where: { id: b2.id } });
check("wrong amount does NOT confirm", got.status === "PENDING", got.status);
await webhook("checkout.session.completed", sessionFor(b2, { payment_status: "unpaid" }));
got = await db.booking.findUnique({ where: { id: b2.id } });
check("unpaid session does NOT confirm", got.status === "PENDING", got.status);

console.log("expiry releases seats");
const heldBefore = await avail();
await webhook("checkout.session.expired", sessionFor(b2, { status: "expired", payment_status: "unpaid" }));
got = await db.booking.findUnique({ where: { id: b2.id } });
check("expired webhook -> EXPIRED", got.status === "EXPIRED", got.status);
a = await avail();
check("seat released", a.yajamani.taken === heldBefore.yajamani.taken - 1, [heldBefore.yajamani, a.yajamani]);
await seed({ yaj: 1, minutes: -1 });
a = await avail();
check("PENDING booking past its hold doesn't count", a.yajamani.taken === heldBefore.yajamani.taken - 1, a.yajamani);

console.log("Yajamani limit of 50");
let cur = (await avail()).yajamani;
const fill = cur.remaining - 1; // leave exactly one seat
if (fill > 0) await seed({ yaj: fill, status: "CONFIRMED" });
cur = (await avail()).yajamani;
check("one Yajamani seat left", cur.remaining === 1, cur);
const post = (body, ip) =>
  fetch(base + "/api/bookings", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json() }));
const who = (n) => ({
  name: "Limit Tester",
  email: `limit${n}-${run}@example.com`,
  phone: `0772${run}${n}`,
  generalQty: 0,
});
let r = await post({ ...who(1), yajamaniQty: 2 }, `10.9.${run % 250}.1`);
check("asking for 2 with 1 left -> SOLD_OUT 409", r.status === 409 && r.data.code === "SOLD_OUT" && /Only 1/.test(r.data.message), r);
await seed({ yaj: 1, status: "CONFIRMED" });
r = await post({ ...who(2), yajamaniQty: 1 }, `10.9.${run % 250}.2`);
check("fully booked -> SOLD_OUT 409", r.status === 409 && r.data.code === "SOLD_OUT" && /fully booked/.test(r.data.message), r);
r = await post({ ...who(3), yajamaniQty: 0, generalQty: 1 }, `10.9.${run % 250}.3`);
check("free tickets still bookable when Yajamani is full", r.status === 200, r);

console.log("cleanup");
await db.booking.deleteMany({ where: { reference: { startsWith: "TEST-" } } });
await db.booking.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
await db.$disconnect();

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
