import { describe, expect, it } from "vitest";
import { PublicReadCache } from "./public-read-cache.js";

describe("PublicReadCache", () => {
  it("computes once and serves the rest from memory", async () => {
    let veces = 0;
    const cache = new PublicReadCache(15_000);
    const compute = async () => {
      veces += 1;
      return { reports: [] };
    };

    await cache.get("mapa", compute);
    await cache.get("mapa", compute);
    await cache.get("mapa", compute);

    expect(veces).toBe(1);
  });

  // El caso que de verdad importa es el pico: mil peticiones llegando a la vez con la caché fría.
  // Sin agrupar las que están en vuelo, la caché no frena ninguna —ninguna ha terminado todavía— y
  // salen mil consultas idénticas contra Postgres, que es exactamente la caída que se quiere evitar.
  it("collapses a stampede into a single computation", async () => {
    let veces = 0;
    const cache = new PublicReadCache(15_000);
    // El `resolve` se saca con un tipo explícito en vez de una variable que empiece en `null`:
    // TypeScript no puede ver que el ejecutor de una promesa corre de inmediato, y la estrecharía
    // a `null` dejándola no invocable.
    let soltar: () => void = () => undefined;
    const bloqueo = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    const compute = async () => {
      veces += 1;
      await bloqueo;
      return { reports: [] };
    };

    const peticiones = Array.from({ length: 50 }, () => cache.get("mapa", compute));
    soltar();
    await Promise.all(peticiones);

    expect(veces).toBe(1);
  });

  it("recomputes once the entry has expired", async () => {
    let veces = 0;
    let ahora = 1_000;
    const cache = new PublicReadCache(15_000, () => ahora);
    const compute = async () => {
      veces += 1;
      return {};
    };

    await cache.get("mapa", compute);
    ahora += 14_000;
    await cache.get("mapa", compute);
    expect(veces).toBe(1);

    ahora += 2_000;
    await cache.get("mapa", compute);
    expect(veces).toBe(2);
  });

  // Si un cálculo falla y la promesa se queda registrada, todas las peticiones siguientes esperan a
  // algo que nunca va a resolver: un fallo momentáneo se convertiría en una caída permanente.
  it("lets the next request retry after a failure", async () => {
    const cache = new PublicReadCache(15_000);
    let veces = 0;
    const compute = async () => {
      veces += 1;
      if (veces === 1) throw new Error("Postgres no responde");
      return { ok: true };
    };

    await expect(cache.get("mapa", compute)).rejects.toThrow("Postgres no responde");
    await expect(cache.get("mapa", compute)).resolves.toContain("true");
    expect(veces).toBe(2);
  });

  it("keeps different keys apart", async () => {
    const cache = new PublicReadCache();
    await cache.get("mapa", async () => ({ a: 1 }));
    await cache.get("listado", async () => ({ b: 2 }));
    expect(cache.size).toBe(2);
  });
});
