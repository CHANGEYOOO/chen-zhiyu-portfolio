import test from "node:test";
import assert from "node:assert/strict";
import { PortfolioApi } from "../api-client.js";

test("always sends same-origin credentials even if a caller supplies another mode", async () => {
  let options;
  const api = new PortfolioApi({
    fetchImpl: async (url, value) => {
      options = value;
      return Response.json({ data: { ok: true } });
    },
  });

  await api.request("/api/admin/session", { credentials: "include" });

  assert.equal(options.credentials, "same-origin");
});
