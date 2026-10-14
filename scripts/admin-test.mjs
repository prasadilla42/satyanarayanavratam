// Checks the admin area is locked down.  node scripts/admin-test.mjs [baseUrl] [password]
const base = process.argv[2] || "http://localhost:3000";
const pass = process.argv[3] || "local-test-password";
const auth = (u, p) => ({ Authorization: "Basic " + Buffer.from(`${u}:${p}`).toString("base64") });
let failures = 0;
const check = (n, c, x) => (c ? console.log(`  ok   ${n}`) : (failures++, console.log(`  FAIL ${n}`, x ?? "")));

const get = (path, headers = {}) => fetch(base + path, { headers });

check("/admin without credentials -> 401", (await get("/admin")).status === 401);
check("/api/admin/export without credentials -> 401", (await get("/api/admin/export?type=bookings")).status === 401);
check("wrong password -> 401", (await get("/admin", auth("admin", "nope"))).status === 401);
const ok = await get("/admin", auth("admin", pass));
const html = await ok.text();
check("correct password -> 200 dashboard", ok.status === 200 && html.includes("Bookings ("), ok.status);
check("dashboard is noindex", (ok.headers.get("x-robots-tag") ?? "").includes("noindex"));
const csv = await get("/api/admin/export?type=bookings", auth("admin", pass));
const text = await csv.text();
check("CSV export works", csv.status === 200 && text.startsWith('"Reference"'), text.slice(0, 80));
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
