import { createAdminServer } from "./app.mjs";
const production = process.env.NODE_ENV === "production";
const server = createAdminServer({
  origin: process.env.ADMIN_ORIGIN ?? "http://localhost:5173",
  identityUrl: process.env.IDENTITY_URL ?? "http://localhost:3004",
  routineUrl: process.env.ROUTINE_URL ?? "http://localhost:3005",
  production,
});
server.listen(
  Number(process.env.PORT ?? 3100),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Barofit admin server ready"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
