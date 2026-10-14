// Smoke test for the booking API. Run against a local dev server with a throw-away database:
//   node scripts/smoke-test.mjs [baseUrl]
// Uses unique emails / phones / IPs per run, so it can be re-run without resetting the database.
const base = process.argv[2] || "http://localhost:3000";
const run = String(Math.floor(1000 + Math.random() * 9000));
let ipCounter = 0;
let failures = 0;

async function post(path, body) {
  const ip = `10.${run % 250}.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`;
  const res = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function check(name, cond, extra) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`, extra ?? "");
  }
}

const phone = (n) => `07${run}${String(n).padStart(4, "0")}`;
const person = (n, extra = {}) => ({
  name: `Test Person ${n}`,
  email: `person${n}-${run}@example.com`,
  phone: phone(n),
  yajamaniQty: 0,
  generalQty: 1,
  ...extra,
});

console.log(`run ${run}`);
console.log("availability");
let a = await (await fetch(base + "/api/availability")).json();
check("capacities are 50 / 300", a.yajamani.capacity === 50 && a.general.capacity === 300, a);
const startGeneral = a.general.taken;

console.log("validation");
let r = await post("/api/bookings", { ...person(1), email: "nope" });
check("bad email rejected", r.status === 400 && r.data.errors?.email, r);
r = await post("/api/bookings", { ...person(1), generalQty: 0, yajamaniQty: 0 });
check("zero tickets rejected", r.status === 400 && r.data.errors?.yajamaniQty, r);
r = await post("/api/bookings", { ...person(1), generalQty: 999 });
check("absurd quantity rejected", r.status === 400, r);
r = await post("/api/bookings", { ...person(1), phone: "abc" });
check("bad phone rejected", r.status === 400 && r.data.errors?.phone, r);

console.log("free booking");
r = await post("/api/bookings", person(1, { generalQty: 3 }));
check("free booking accepted", r.status === 200 && r.data.type === "free" && r.data.url.includes("/confirmation"), r);
const page = await fetch(base + r.data.url);
const html = await page.text();
check("confirmation page shows reference", page.status === 200 && /SSV26-[A-Z0-9]{6}/.test(html));
const bad = await (await fetch(base + "/confirmation?ref=SSV26-AAAAAA&token=x")).text();
check("confirmation with wrong token shows 'not found'", bad.includes("Booking not found"));

console.log("duplicates");
r = await post("/api/bookings", person(1));
check("same email + phone rejected", r.status === 409 && r.data.code === "DUPLICATE", r);
r = await post("/api/bookings", person(2, { email: person(1).email.toUpperCase() }));
check("same email (different case) rejected", r.status === 409 && r.data.code === "DUPLICATE", r);
r = await post("/api/bookings", person(3, { phone: "+44 7" + phone(1).slice(2) }));
check("same phone (+44 format) rejected", r.status === 409 && r.data.code === "DUPLICATE", r);
r = await post("/api/bookings", person(4, { email: `jo.hn${run}+puja@gmail.com` }));
check("gmail first booking ok", r.status === 200, r);
r = await post("/api/bookings", person(5, { email: `john${run}@googlemail.com` }));
check("gmail dots / +tag / googlemail treated as the same", r.status === 409 && r.data.code === "DUPLICATE", r);

console.log("concurrency: 10 simultaneous bookings, same email");
const results = await Promise.all(
  Array.from({ length: 10 }, (_, i) => post("/api/bookings", person(100, { phone: phone(1000 + i) }))),
);
check("exactly one succeeded", results.filter((x) => x.status === 200).length === 1, results.map((x) => x.status));

console.log("capacity");
a = await (await fetch(base + "/api/availability")).json();
check("general taken increased by 3 + 1 + 1", a.general.taken - startGeneral === 5, a.general);
r = await post("/api/bookings", person(200, { generalQty: 20 }));
check("20 free tickets ok", r.status === 200, r);

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
