/**
 * Caché en proceso para las lecturas públicas caras.
 *
 * **Por qué hace falta y por qué no bastaba lo que había.** Las rutas ya declaraban
 * `s-maxage=30`... y no hay ninguna caché compartida que lo lea: Caddy es un proxy inverso sin
 * caché. Esa cabecera era decoración. Medido el 18/08 contra producción:
 *
 * | Ruta | Peso | Tiempo |
 * | --- | --- | --- |
 * | mapa | 1,31 MB | 1,2–2,6 s |
 * | listado | 917 KB | ~2 s |
 * | territorios | 984 KB | ~1,4 s |
 *
 * Una visita son ~2,4 MB y unos 5 s de servidor, y **cada visitante los pagaba entero contra
 * Postgres**. Mil personas llegando de un medio grande eran mil consultas idénticas.
 *
 * Con 15 segundos de caché, esas mil se convierten en una. Es la diferencia entre aguantar un
 * enlace en prensa y no aguantarlo — mucho más que cualquier límite por IP, que solo frena a quien
 * abusa desde una sola dirección.
 *
 * **Por qué en proceso y no Redis.** Redis ya está pero compartido con otras apps del host, y esto
 * son cuatro respuestas de pocos MB con vida de segundos. Meter una dependencia de red en el camino
 * de lectura pública añade un modo de fallo nuevo para ahorrar memoria que sobra.
 */

type Entry = { body: string; expiresAt: number };

/**
 * Una promesa por clave mientras se calcula.
 *
 * Sin esto, mil peticiones que llegan a la vez con la caché fría lanzan mil consultas: la caché no
 * las frena porque ninguna ha terminado todavía. Es el caso que más importa —justo el pico— así que
 * las que llegan durante el cálculo esperan a la primera en vez de sumarse.
 */
export class PublicReadCache {
  #entries = new Map<string, Entry>();
  #inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly ttlMs = 15_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async get(key: string, compute: () => Promise<unknown>): Promise<string> {
    const cached = this.#entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.body;

    const running = this.#inFlight.get(key);
    if (running) return running;

    const promise = (async () => {
      const value = await compute();
      const body = JSON.stringify(value);
      this.#entries.set(key, { body, expiresAt: this.now() + this.ttlMs });
      return body;
    })();

    this.#inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      // Se suelta pase lo que pase: si el cálculo falló, la siguiente petición debe reintentar en
      // vez de quedarse esperando a una promesa muerta.
      this.#inFlight.delete(key);
    }
  }

  /** Cuántas entradas vivas hay. Solo para las pruebas y para poder mirarlo si algo va raro. */
  get size(): number {
    return this.#entries.size;
  }
}
