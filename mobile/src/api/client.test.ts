import { ApiError, createApiClient, messageOf } from "./client";

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("client de l'API", () => {
  it("envoie le jeton en Bearer et le corps en JSON, sur /api/mobile/v1", async () => {
    const { impl, calls } = fakeFetch(200, { ok: true });
    const api = createApiClient({ baseUrl: "https://salon.test/", getToken: () => "abc", fetchImpl: impl });
    await api.post("/appointments", { a: 1 });
    expect(calls[0].url).toBe("https://salon.test/api/mobile/v1/appointments");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer abc");
    expect(headers["content-type"]).toBe("application/json");
    expect(calls[0].init.body).toBe('{"a":1}');
  });

  it("sans jeton, aucun en-tête Authorization", async () => {
    const { impl, calls } = fakeFetch(200, {});
    await createApiClient({ baseUrl: "https://s.test", getToken: () => null, fetchImpl: impl }).get("/vitrine");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("un refus devient une ApiError avec le code du serveur et la phrase française", async () => {
    const { impl } = fakeFetch(409, { code: "slot_unavailable" });
    const api = createApiClient({ baseUrl: "https://s.test", getToken: () => "t", fetchImpl: impl });
    const error = (await api.post("/appointments", {}).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("slot_unavailable");
    expect(error.status).toBe(409);
    expect(error.message).toBe("Ce créneau vient d'être pris. Choisissez-en un autre.");
  });

  it("garde les erreurs par champ et le délai d'attente d'un 429", async () => {
    const a = createApiClient({
      baseUrl: "https://s.test",
      getToken: () => null,
      fetchImpl: fakeFetch(400, { code: "invalid", fieldErrors: { email: "Adresse invalide" } }).impl,
    });
    expect(((await a.post("/x").catch((e) => e)) as ApiError).fieldErrors).toEqual({ email: "Adresse invalide" });
    const b = createApiClient({
      baseUrl: "https://s.test",
      getToken: () => null,
      fetchImpl: fakeFetch(429, { code: "rate_limited", retryAfterSeconds: 300 }).impl,
    });
    expect(((await b.post("/x").catch((e) => e)) as ApiError).message).toBe(
      "Trop d'essais. Réessayez dans 5 minutes.",
    );
  });

  it("« pas connecté » avec un jeton signale une session expirée ; sans jeton ou mauvais mot de passe, non", async () => {
    let expired = 0;
    const make = (token: string | null, body: unknown, status = 401) =>
      createApiClient({
        baseUrl: "https://s.test",
        getToken: () => token,
        onSessionExpired: () => {
          expired++;
        },
        fetchImpl: fakeFetch(status, body).impl,
      });
    await make("t", { code: "not_signed_in" }).get("/me").catch(() => {});
    expect(expired).toBe(1);
    await make(null, { code: "not_signed_in" }).get("/me").catch(() => {});
    await make("t", { code: "invalid_credentials" }).post("/auth/login").catch(() => {});
    expect(expired).toBe(1);
  });

  it("panne de réseau ou délai dépassé : code « network »", async () => {
    const failing = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    const error = (await createApiClient({ baseUrl: "https://s.test", getToken: () => null, fetchImpl: failing })
      .get("/vitrine")
      .catch((e) => e)) as ApiError;
    expect(error.code).toBe("network");
    expect(messageOf(error)).toContain("Pas de connexion");
  });

  it("réponse illisible avec une erreur HTTP, ou code inconnu : phrase générale", async () => {
    const api = createApiClient({
      baseUrl: "https://s.test",
      getToken: () => null,
      fetchImpl: fakeFetch(502, "<html>Bad gateway</html>").impl,
    });
    expect(((await api.get("/vitrine").catch((e) => e)) as ApiError).code).toBe("failed");
    expect(messageOf(new ApiError("code_futur", 422))).toContain("Une erreur est survenue");
  });
});
