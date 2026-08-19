import type { Metadata } from "next";
import { Footer } from "../components/footer";
import { SiteNav } from "../components/site-nav";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos personales",
  description:
    "Qué datos guarda Pulso, para qué, quién los ve, cuánto tiempo y cómo pedir que se borren. Ley 1581 de 2012 y Decreto 1377 de 2013.",
  alternates: { canonical: "/privacidad" },
  // No hay razón para que esta página aparezca en un buscador antes que las que sirven a alguien
  // que perdió la casa, pero sí tiene que ser encontrable desde el formulario y desde el pie.
  robots: { index: true, follow: true },
};

/**
 * Política de Tratamiento de la Información.
 *
 * La exige el artículo 13 del Decreto 1377 de 2013 con seis contenidos mínimos, y **no existía**.
 * Están los seis, en el mismo orden del decreto, y escrita para que la entienda quien la va a leer
 * —alguien que acaba de registrar a su familia— y no para que la apruebe un abogado sin que nadie
 * más la lea.
 */
export default function PrivacidadPage() {
  return (
    <>
      <SiteNav />
      <main className="legalMain">
        <section className="legalHero">
          <h1>Qué hacemos con tus datos</h1>
          <p className="legalLede">
            Escrito para que se entienda. Es la política de tratamiento que exige el artículo 13 del
            Decreto 1377 de 2013, con todo lo que ese artículo pide y en su mismo orden.
          </p>
          <p className="legalDate">Vigente desde el 18 de agosto de 2026 · versión 1</p>
        </section>

        <section className="legalSection">
          <h2>1. Quién responde por estos datos</h2>
          <p>
            <strong>Pulso</strong>, plataforma de código abierto de respuesta a la emergencia,
            publicada bajo licencia Apache-2.0 y desarrollada de forma voluntaria.
          </p>
          <ul>
            <li>
              Sitio: <code>pulso.my</code>
            </li>
            <li>
              Correo para todo lo relacionado con datos personales:{" "}
              <a href="mailto:vortexlabcol@gmail.com">vortexlabcol@gmail.com</a>
            </li>
            <li>
              Código fuente auditable:{" "}
              <a
                href="https://github.com/AsymmetricFrequency/pulso"
                target="_blank"
                rel="noreferrer noopener"
              >
                github.com/AsymmetricFrequency/pulso
              </a>
            </li>
          </ul>
          <p className="legalNote">
            <strong>Pulso no es una autoridad.</strong> No decidimos quién recibe ayuda y
            registrarse aquí no inscribe a nadie en ningún programa. El censo oficial lo hacen las
            autoridades.
          </p>
        </section>

        <section className="legalSection">
          <h2>2. Qué guardamos y para qué</h2>
          <p>
            Solo de quien se registra en el censo comunitario. Quien únicamente mira el mapa no deja
            ningún dato personal.
          </p>
          <div className="legalTableWrap">
            <table className="legalTable">
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  <th scope="col">¿Obligatorio?</th>
                  <th scope="col">Para qué</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Municipio y barrio o vereda</td>
                  <td>Sí</td>
                  <td>Para que una brigada sepa a dónde ir. No pedimos dirección exacta.</td>
                </tr>
                <tr>
                  <td>Cuántas personas viven en el hogar</td>
                  <td>Sí</td>
                  <td>Para dimensionar la ayuda que hace falta en una zona.</td>
                </tr>
                <tr>
                  <td>Si ya los censó una brigada</td>
                  <td>Sí</td>
                  <td>Es la razón de ser del registro: saber a dónde no ha ido nadie.</td>
                </tr>
                <tr>
                  <td>Nombre y teléfono</td>
                  <td>No</td>
                  <td>Solo si quieres que alguien pueda llamarte. Se guardan cifrados.</td>
                </tr>
                <tr>
                  <td>Documento de identidad</td>
                  <td>No</td>
                  <td>
                    Para detectar registros repetidos del mismo hogar. Cifrado. Nadie queda fuera
                    por no tenerlo.
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Discapacidad, embarazo o enfermedad</strong>
                  </td>
                  <td>
                    <strong>No, y son datos sensibles</strong>
                  </td>
                  <td>
                    Son datos de salud. <strong>No estás obligado a responderlos</strong> ni a
                    autorizar su uso, y no responderlos no te quita nada. Sirven para dar prioridad
                    en albergues.
                  </td>
                </tr>
                <tr>
                  <td>Foto del daño</td>
                  <td>No</td>
                  <td>
                    Le quitamos la ubicación y los datos del teléfono antes de guardarla. No se
                    publica nunca.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Las dos finalidades, y son independientes</h3>
          <p>Autorizas cada una por separado y puedes autorizar solo la primera:</p>
          <ol className="legalPurposes">
            <li>
              <strong>Decirle a tu alcaldía que tu hogar resultó afectado</strong> y, si es el caso,
              que todavía no los ha censado nadie. Se entrega agrupado por barrio.
            </li>
            <li>
              <strong>Que una organización pueda contactarte para hacerte llegar ayuda</strong> y
              dejar constancia de que la recibiste.
            </li>
          </ol>
          <p className="legalNote">
            No usamos tus datos para nada que no hayas marcado. Si en el futuro hiciera falta una
            finalidad nueva, te la tendríamos que preguntar de nuevo — no vale reinterpretar lo que
            ya autorizaste.
          </p>
        </section>

        <section className="legalSection">
          <h2>3. Tus derechos</h2>
          <ul>
            <li>
              <strong>Conocer</strong> qué datos tuyos tenemos.
            </li>
            <li>
              <strong>Corregirlos</strong> si están mal o incompletos.
            </li>
            <li>
              <strong>Pedir que se borren</strong>, en cualquier momento y sin dar explicaciones.
            </li>
            <li>
              <strong>Revocar la autorización</strong> que diste.
            </li>
            <li>
              <strong>Saber cómo se usaron</strong>: guardamos quién consultó un dato personal tuyo,
              cuándo y para qué.
            </li>
            <li>
              <strong>Quejarte ante la Superintendencia de Industria y Comercio</strong> si crees
              que incumplimos.
            </li>
          </ul>
          <p className="legalNote">
            Ningún derecho depende de que tengas cuenta con nosotros, porque no hay cuentas.
          </p>
        </section>

        <section className="legalSection">
          <h2>4. A quién preguntarle</h2>
          <p>
            Escribe a <a href="mailto:vortexlabcol@gmail.com">vortexlabcol@gmail.com</a>. Responde
            el equipo responsable del proyecto. No hay formulario ni número de radicado: es un
            correo y una persona lo lee.
          </p>
        </section>

        <section className="legalSection">
          <h2>5. Cómo ejercer tus derechos</h2>
          <p>
            <strong>Con el código que recibiste al registrarte</strong>, que es lo único que hace
            falta. Sirve para consultar y para borrar, y no pide cuenta ni contraseña.
          </p>
          <ol className="legalSteps">
            <li>
              Busca el código que te dimos al terminar el registro. Tiene esta forma: ABCD-1234.
            </li>
            <li>
              Escríbenos a <a href="mailto:vortexlabcol@gmail.com">vortexlabcol@gmail.com</a> con
              ese código y lo que quieres: consultar, corregir o borrar.
            </li>
            <li>
              Si pides el borrado, tu nombre, teléfono, documento y fotos se borran. Se conserva
              únicamente el conteo agregado de tu municipio, que ya no te identifica.
            </li>
          </ol>
          <p className="legalNote">
            <strong>Por qué se conserva el conteo:</strong> la cifra de hogares afectados de un
            municipio no puede bajar porque alguien ejerció un derecho. El número agregado no es un
            dato personal; tu nombre sí.
          </p>
          <p>
            Si perdiste el código, escríbenos igual. Te vamos a pedir alguna forma de comprobar que
            el registro es tuyo antes de borrar nada — si no lo hiciéramos, cualquiera podría borrar
            el registro de otro.
          </p>
        </section>

        <section className="legalSection">
          <h2>6. Cuánto tiempo los guardamos</h2>
          <p>
            <strong>90 días desde el registro</strong>, y después el borrado es automático: nombre,
            teléfono, documento y fotos se eliminan solos, sin que tengas que pedirlo.
          </p>
          <p>
            Noventa días es más de lo que dura la fase de respuesta y menos de lo que dura la
            reconstrucción. Cubre el uso real sin convertirnos en un archivo permanente de
            damnificados, que es exactamente lo que no queremos ser.
          </p>
          <p className="legalNote">
            El artículo 11 del Decreto 1377 obliga a suprimir los datos una vez cumplida la
            finalidad que los justificó. Aquí esa finalidad se agota, y por eso el borrado corre
            solo en vez de depender de que alguien se acuerde.
          </p>
          <p>
            <strong>Vigencia de esta política:</strong> desde el 18 de agosto de 2026. La base de
            datos del censo comunitario existe mientras dure la atención de la emergencia del sismo
            del 10 de agosto de 2026.
          </p>
        </section>

        <section className="legalSection">
          <h2>Cómo protegemos lo que guardamos</h2>
          <ul>
            <li>
              Nombre, teléfono y documento se guardan <strong>cifrados</strong> con AES-256-GCM, con
              una clave dedicada que no se comparte con ninguna otra parte del sistema.
            </li>
            <li>
              A las fotos se les <strong>quitan los metadatos</strong> —incluida la coordenada GPS
              que el teléfono incrusta— antes de guardarlas.
            </li>
            <li>
              Las rutas públicas devuelven <strong>solo cifras agregadas</strong>. Ningún dato
              personal sale por una dirección que no exija sesión.
            </li>
            <li>
              Cada vez que alguien autorizado mira un dato personal o una foto,{" "}
              <strong>queda registrado quién fue, cuándo y para qué</strong>.
            </li>
            <li>
              El código es abierto: cualquiera puede comprobar que esto es lo que hace el programa y
              no solo lo que dice esta página.
            </li>
          </ul>
        </section>

        <section className="legalSection">
          <h2>Lo que no hacemos</h2>
          <ul>
            <li>No vendemos ni cedemos datos a nadie con fines comerciales.</li>
            <li>No publicamos nombres, teléfonos ni direcciones exactas.</li>
            <li>
              No publicamos listados de personas desaparecidas. Esa ruta es de las autoridades.
            </li>
            <li>
              No condicionamos el registro a que entregues datos de salud ni documento de identidad.
            </li>
            <li>No usamos los datos para decidir quién recibe ayuda: eso no nos corresponde.</li>
          </ul>
        </section>

        <Footer />
      </main>
    </>
  );
}
