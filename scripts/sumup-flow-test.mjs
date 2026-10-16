// Tests the SumUp payment flow WITHOUT a real SumUp account.
//
// It starts a small fake SumUp API server (http://127.0.0.1:4010) that follows the documented
// Checkouts API, and drives the real site against it:
//   create booking -> hosted checkout -> callback -> verification -> confirmed
//
// Requires in .env (already the case for local development):
//   SUMUP_API_KEY="sup_sk_dummy_local"  SUMUP_MERCHANT_CODE="MCLOCAL1"  SUMUP_API_BASE="http://127.0.0.1:4010"
// and the site + database running (npm run dev).
//   node scripts/sumup-flow-test.mjs [baseUrl]
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const base = process.argv[2] || "http://localhost:3000";
const MERCHANT = "MCLOCAL1";
const API_KEY = "sup_sk_dummy_local";
const db = new PrismaClient();
const run = String(Math.floor(1000 + Math.random() * 9000));
let failures = 0;

const check = (name, cond, extra) => {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
};

/* ---------------- fake SumUp API ---------------- */
const checkouts = new Map();
const calls = { create: [], get: 0, auth: [], emails: [] };
let failNext = false;

const fake = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(body === undefined ? "" : JSON.stringify(body));
    };
    // Fake Brevo transactional email API
    if (req.method === "POST" && req.url === "/v3/smtp/email") {
      if (req.headers["api-key"] !== "xkeysib-dummy-local") return send(401, { code: "unauthorized", message: "Key not found" });
      const b = JSON.parse(raw);
      if (!b.sender?.email || !b.to?.[0]?.email || !b.subject || !(b.htmlContent || b.textContent)) {
        return send(400, { code: "missing_parameter", message: "sender, to, subject and content are required" });
      }
      calls.emails.push(b);
      return send(201, { messageId: `<${randomUUID()}@fake>` });
    }
    calls.auth.push(req.headers.authorization);
    if (req.headers.authorization !== `Bearer ${API_KEY}`) return send(401, { message: "Unauthorized" });

    const m = req.url.match(/^\/v0\.1\/checkouts(?:\/([^/?]+))?/);
    if (!m) return send(404, { message: "not found" });

    if (req.method === "POST" && !m[1]) {
      const b = JSON.parse(raw);
      calls.create.push(b);
      if (failNext) {
        failNext = false;
        return send(401, { message: "Invalid API key" });
      }
      const problems = [];
      if (b.merchant_code !== MERCHANT) problems.push("merchant_code");
      if (typeof b.amount !== "number" || b.amount <= 0) problems.push("amount");
      if (b.currency !== "GBP") problems.push("currency");
      if (!b.checkout_reference || b.checkout_reference.length > 64) problems.push("checkout_reference");
      if (!b.hosted_checkout || b.hosted_checkout.enabled !== true) problems.push("hosted_checkout");
      if (!b.redirect_url) problems.push("redirect_url");
      if (!b.valid_until || Number.isNaN(Date.parse(b.valid_until))) problems.push("valid_until");
      if ([...checkouts.values()].some((c) => c.checkout_reference === b.checkout_reference)) problems.push("duplicate reference");
      if (problems.length) return send(400, { message: `Invalid: ${problems.join(", ")}` });
      const id = randomUUID();
      const c = {
        id,
        checkout_reference: b.checkout_reference,
        amount: b.amount,
        currency: b.currency,
        merchant_code: b.merchant_code,
        description: b.description,
        status: "PENDING",
        valid_until: b.valid_until,
        hosted_checkout: { enabled: true },
        hosted_checkout_url: `https://checkout.sumup.com/pay/${randomUUID()}`,
        transactions: [],
      };
      checkouts.set(id, c);
      return send(201, c);
    }
    const c = m[1] && checkouts.get(m[1]);
    if (!c) return send(404, { message: "Not found" });
    if (req.method === "GET") {
      calls.get++;
      return send(200, c);
    }
    if (req.method === "DELETE") {
      c.status = "EXPIRED";
      return send(200, c);
    }
    return send(405, {});
  });
});
await new Promise((r) => fake.listen(4010, "127.0.0.1", r));

/* ---------------- helpers ---------------- */
const post = (path, body, ip) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

let ipN = 0;
const ip = () => `10.8.${run % 250}.${++ipN}`;
const who = (n) => ({
  name: `Sumup Tester ${n}`,
  email: `sumup${n}-${run}@example.com`,
  phone: `0773${run}${n}`,
  gothram: "",
  notes: "",
  website: "",
  yajamaniQty: 0,
  generalQty: 0,
});
const callback = (id, event_type = "CHECKOUT_STATUS_CHANGED") =>
  fetch(base + "/api/webhooks/sumup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event_type, id }),
  }).then((r) => r.status);
const avail = async () => (await fetch(base + "/api/availability")).json();
const fakeFor = (booking) => checkouts.get(booking.sumupCheckoutId);
const pay = (c, over = {}) => {
  Object.assign(c, { status: "PAID", transactions: [{ id: randomUUID(), transaction_code: `TAAA${randomBytes(3).toString("hex").toUpperCase()}`, status: "SUCCESSFUL" }] }, over);
};

try {
  /* ---------- creating a paid booking ---------- */
  console.log("paid booking creates a SumUp hosted checkout");
  const before = await avail();
  let r = await post("/api/bookings", { ...who(1), yajamaniQty: 2, generalQty: 1 }, ip());
  check("booking accepted, returns SumUp payment page URL", r.status === 200 && r.data.type === "paid" && /^https:\/\/checkout\.sumup\.com\/pay\//.test(r.data.url), r);
  let b1 = await db.booking.findFirst({ where: { email: who(1).email } });
  check("booking is PENDING and stores the checkout id + url", b1?.status === "PENDING" && b1.sumupCheckoutId && b1.sumupCheckoutUrl === r.data.url, b1);
  const created = calls.create.at(-1) ?? {};
  check("SumUp request: amount 102 (2 x £51, in pounds), GBP", created.amount === 102 && created.currency === "GBP", created);
  check("SumUp request: reference, merchant, hosted checkout enabled", created.checkout_reference === b1?.reference && created.merchant_code === MERCHANT && created.hosted_checkout?.enabled === true, created);
  check("SumUp request: redirect_url points to our confirmation page", /\/confirmation\?ref=.+&token=.+/.test(created.redirect_url ?? ""), created.redirect_url);
  check("SumUp request authorised with Bearer API key", calls.auth.every((a) => a === `Bearer ${API_KEY}`));
  let a = await avail();
  check("pending booking holds 2 Yajamani + 1 General seats", a.yajamani.taken === before.yajamani.taken + 2 && a.general.taken === before.general.taken + 1, a);

  console.log("callback handling");
  check("callback for unpaid checkout is accepted", (await callback(b1.sumupCheckoutId)) === 204);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("still PENDING while SumUp says PENDING", b1.status === "PENDING", b1.status);
  const getsBefore = calls.get;
  check("unknown checkout id ignored (204)", (await callback(randomUUID())) === 204);
  check("unknown id does NOT call SumUp", calls.get === getsBefore);
  check("other event types ignored (204)", (await callback(b1.sumupCheckoutId, "SOMETHING_ELSE")) === 204);
  const bad = await fetch(base + "/api/webhooks/sumup", { method: "POST", body: "not json" }).then((x) => x.status);
  check("malformed body rejected (400)", bad === 400, bad);
  check("garbage id ignored", (await callback("../../etc/passwd")) === 204);

  console.log("tampering is rejected (only SumUp's own data counts)");
  const c1 = fakeFor(b1);
  pay(c1, { amount: 1 });
  await callback(b1.sumupCheckoutId);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("PAID but wrong amount does NOT confirm", b1.status === "PENDING", b1.status);
  pay(c1, { amount: 102, currency: "EUR" });
  await callback(b1.sumupCheckoutId);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("PAID but wrong currency does NOT confirm", b1.status === "PENDING", b1.status);
  pay(c1, { currency: "GBP", merchant_code: "MCOTHER9" });
  await callback(b1.sumupCheckoutId);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("PAID to a different merchant does NOT confirm", b1.status === "PENDING", b1.status);
  pay(c1, { merchant_code: MERCHANT, checkout_reference: "SOMEONE-ELSE" });
  await callback(b1.sumupCheckoutId);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("PAID with a different reference does NOT confirm", b1.status === "PENDING", b1.status);

  console.log("genuine payment confirms the booking");
  pay(c1, { checkout_reference: b1.reference });
  check("callback accepted", (await callback(b1.sumupCheckoutId)) === 204);
  b1 = await db.booking.findUnique({ where: { id: b1.id } });
  check("booking CONFIRMED + paidAt set", b1.status === "CONFIRMED" && b1.paidAt, b1.status);
  check("SumUp transaction code stored", /^TAAA/.test(b1.sumupTransactionId ?? ""), b1.sumupTransactionId);
  await new Promise((r) => setTimeout(r, 1500));
  const mail = calls.emails.find((m) => m.to[0].email === who(1).email);
  check("confirmation email sent through Brevo to the customer", !!mail, calls.emails.map((m) => m.to));
  check("email has sender, subject with reference, HTML + text", !!mail && mail.sender.email === "bookings@example.com" && mail.subject.includes(b1.reference) && mail.htmlContent.includes(b1.reference) && !!mail.textContent, mail?.subject);
  check("callback replay is idempotent", (await callback(b1.sumupCheckoutId)) === 204);
  a = await avail();
  check("seats counted once", a.yajamani.taken === before.yajamani.taken + 2 && a.general.taken === before.general.taken + 1, a);
  await new Promise((r) => setTimeout(r, 1000));
  check("replayed callback did NOT send a second email", calls.emails.filter((m) => m.to[0].email === who(1).email).length === 1, calls.emails.length);

  console.log("duplicate + resume");
  r = await post("/api/bookings", { ...who(1), yajamaniQty: 1 }, ip());
  check("same person again after paying -> DUPLICATE 409", r.status === 409 && r.data.code === "DUPLICATE", r);
  r = await post("/api/bookings", { ...who(2), yajamaniQty: 1 }, ip());
  const first = r.data.url;
  check("second person gets a checkout", r.status === 200 && !!first, r);
  r = await post("/api/bookings", { ...who(2), yajamaniQty: 1 }, ip());
  check("same unpaid person resumes the SAME SumUp page", r.status === 200 && r.data.resumed === true && r.data.url === first, r);
  const b2 = await db.booking.findFirst({ where: { email: who(2).email } });
  check("only one booking row for them", (await db.booking.count({ where: { email: who(2).email } })) === 1);

  console.log("confirmation page verifies with SumUp by itself (no callback needed)");
  pay(fakeFor(b2));
  const page = await fetch(`${base}/confirmation?ref=${b2.reference}&token=${b2.accessToken}`).then((x) => x.text());
  const got2 = await db.booking.findUnique({ where: { id: b2.id } });
  check("booking CONFIRMED after opening the confirmation page", got2.status === "CONFIRMED", got2.status);
  check("page shows the confirmation", /confirmed/i.test(page) && page.includes(b2.reference));
  const wrongToken = await fetch(`${base}/confirmation?ref=${b2.reference}&token=wrong`).then((x) => x.text());
  check("wrong token does not reveal the booking", !wrongToken.includes(b2.name) && /not found/i.test(wrongToken));

  console.log("expiry releases seats");
  r = await post("/api/bookings", { ...who(3), yajamaniQty: 1 }, ip());
  let b3 = await db.booking.findFirst({ where: { email: who(3).email } });
  const held = await avail();
  fakeFor(b3).status = "EXPIRED";
  check("expired callback accepted", (await callback(b3.sumupCheckoutId)) === 204);
  b3 = await db.booking.findUnique({ where: { id: b3.id } });
  a = await avail();
  check("booking EXPIRED and seat released", b3.status === "EXPIRED" && a.yajamani.taken === held.yajamani.taken - 1, [b3.status, held.yajamani, a.yajamani]);

  console.log("payment arriving after the hold lapsed");
  r = await post("/api/bookings", { ...who(4), yajamaniQty: 1 }, ip());
  let b4 = await db.booking.findFirst({ where: { email: who(4).email } });
  await db.booking.update({ where: { id: b4.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  pay(fakeFor(b4));
  await callback(b4.sumupCheckoutId);
  b4 = await db.booking.findUnique({ where: { id: b4.id } });
  check("seats still free -> late payment still CONFIRMS", b4.status === "CONFIRMED", b4.status);

  console.log("SumUp errors are handled");
  const heldBeforeFail = (await avail()).yajamani.taken;
  failNext = true;
  r = await post("/api/bookings", { ...who(5), yajamaniQty: 1 }, ip());
  check("SumUp rejecting the checkout -> clean 500 message", r.status === 500 && r.data.code === "SERVER_ERROR", r);
  const b5 = await db.booking.findFirst({ where: { email: who(5).email } });
  check("failed booking is CANCELLED and holds no seat", b5?.status === "CANCELLED" && (await avail()).yajamani.taken === heldBeforeFail, b5?.status);
  r = await post("/api/bookings", { ...who(5), yajamaniQty: 1 }, ip());
  check("person can try again straight away", r.status === 200 && r.data.type === "paid", r);

  console.log("donations");
  r = await post("/api/donations", { name: "Donor One", email: `donor-${run}@example.com`, amountPence: 2100, message: "", website: "" }, ip());
  check("donation returns SumUp payment page URL", r.status === 200 && /^https:\/\/checkout\.sumup\.com\/pay\//.test(r.data.url), r);
  let d1 = await db.donation.findFirst({ where: { email: `donor-${run}@example.com` } });
  check("donation PENDING with checkout id", d1?.status === "PENDING" && !!d1.sumupCheckoutId, d1);
  check("SumUp request: amount 21 GBP", calls.create.at(-1).amount === 21 && calls.create.at(-1).currency === "GBP", calls.create.at(-1));
  pay(fakeFor(d1), { amount: 5 });
  await callback(d1.sumupCheckoutId);
  d1 = await db.donation.findUnique({ where: { id: d1.id } });
  check("wrong amount does NOT mark donation paid", d1.status === "PENDING", d1.status);
  pay(fakeFor(d1), { amount: 21 });
  await callback(d1.sumupCheckoutId);
  d1 = await db.donation.findUnique({ where: { id: d1.id } });
  check("genuine payment marks donation PAID", d1.status === "PAID" && !!d1.paidAt && !!d1.sumupTransactionId, d1.status);

  console.log("Yajamani limit of 50");
  let cur = (await avail()).yajamani;
  const fill = cur.remaining - 1;
  if (fill > 0) {
    await db.booking.create({
      data: { reference: `TEST-${run}-F`, accessToken: `tok-${run}-F`, status: "CONFIRMED", name: "Filler", email: `filler-${run}@example.com`, phone: "0000", emailKey: `filler-${run}@example.com`, phoneKey: `0000${run}`, yajamaniQty: fill, amountPence: fill * 5100 },
    });
  }
  cur = (await avail()).yajamani;
  check("one Yajamani seat left", cur.remaining === 1, cur);
  r = await post("/api/bookings", { ...who(6), yajamaniQty: 2 }, ip());
  check("asking for 2 with 1 left -> SOLD_OUT 409", r.status === 409 && r.data.code === "SOLD_OUT" && /Only 1/.test(r.data.message), r);
  r = await post("/api/bookings", { ...who(7), yajamaniQty: 0, generalQty: 1 }, ip());
  check("free tickets still bookable", r.status === 200 && r.data.type === "free", r);
} finally {
  console.log("cleanup");
  await db.booking.deleteMany({ where: { OR: [{ email: { contains: `-${run}@example.com` } }, { reference: { startsWith: "TEST-" } }] } });
  await db.donation.deleteMany({ where: { email: { contains: `-${run}@example.com` } } });
  await db.$disconnect();
  fake.close();
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
