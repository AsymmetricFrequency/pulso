# Identidad y confianza operacional P0

## Decisión

PULSO no confunde identidad con acceso. Una persona afectada puede reportar una necesidad y recibir ayuda sin presentar documento. La verificación aumenta únicamente cuando el actor adquiere capacidad para coordinar, certificar, auditar o autorizar entregas.

La solución separa cuatro preguntas:

1. **Autenticación:** ¿controla el dispositivo o sesión con la que entra?
2. **Identidad:** ¿qué atributos afirma sobre sí mismo?
3. **Credenciales:** ¿qué organización o registro respalda esos atributos?
4. **Autorización:** ¿qué acciones puede ejecutar en esta emergencia?

## Niveles de aseguramiento

| Nivel | Señal mínima | Uso permitido en el MVP |
| --- | --- | --- |
| A0 | Actor registrado, sin verificación | Persona afectada, observador y reporte básico |
| A1 | Teléfono o correo verificado | Recuperación de acceso y contacto |
| A2 | Aval activo de coordinador u organización | Brigadista y miembro de equipo |
| A3 | Identidad verificada + matrícula profesional vigente | Certificación técnica o sanitaria |
| A4 | Identidad verificada + dos avales + rol auditor/administrador | Auditoría y control de alto impacto |

El nivel se calcula, no se edita manualmente. Es una señal para políticas de autorización; no es una puntuación social.

## Flujo rápido de campo

1. La coordinación crea al actor e invita su dispositivo mediante el flujo de misión existente.
2. El actor usa una passkey para regresar sin contraseña.
3. Si solo reporta o recibe ayuda, permanece en A0/A1.
4. Para integrar una brigada, un coordinador activo emite un aval y el actor alcanza A2.
5. Para certificar, la coordinación revisa identidad y consulta el registro profesional correspondiente. El sistema conserva resultado, fuente, fecha y vencimiento, no el número en claro.
6. El perfil de confianza muestra nivel y distintivos comprensibles antes de permitir una acción sensible.

## Privacidad y deduplicación

- El documento y la matrícula profesional llegan únicamente en la solicitud de alta.
- Se normalizan en memoria y se transforman con HMAC-SHA-256 y un secreto independiente.
- PostgreSQL conserva solo la huella no reversible y una pista enmascarada, por ejemplo `***7890`.
- La huella es específica de la emergencia y permite detectar un mismo identificador vinculado a dos actores.
- No se almacenan imágenes del documento ni plantillas biométricas en P0.
- `IDENTITY_FINGERPRINT_SECRET` debe tener 32 caracteres o más, estar fuera del repositorio y rotarse mediante un procedimiento controlado.

La deduplicación indica una colisión para revisión humana; nunca rechaza automáticamente ayuda humanitaria.

## Validadores admitidos

Solo actores activos del mismo incidente con rol `coordinator`, `auditor` o `incident_admin` pueden verificar, avalar o registrar una matrícula consultada. Cada operación sensible deja un evento de auditoría.

Para Colombia, P0 registra consultas manuales a fuentes oficiales:

- CPNAA para arquitectura y profesiones auxiliares: <https://www.cpnaa.gov.co/entradas/>
- COPNIA para ingeniería y profesiones afines: <https://tramites.copnia.gov.co/copnia_microsite/certificateofgoodstanding/certificateofgoodstandingstart>
- ReTHUS para talento humano en salud: <https://www.sispro.gov.co/central-prestadores-de-servicios/Pages/ReTHUS-Registro-de-Talento-Humano-en-Salud.aspx>

El acceso automatizado a datos biométricos de la Registraduría no se presume público: requiere el convenio, la base legal y los controles aplicables. PULSO no depende de esa integración para operar.

## API P0

- `GET /v1/actors/:actorId/trust-profile`
- `GET|POST /v1/actors/:actorId/identity-claims`
- `GET /v1/actors/:actorId/identity-verifications`
- `POST /v1/actors/:actorId/identity-claims/:claimId/verifications`
- `GET|POST /v1/actors/:actorId/endorsements`
- `GET|POST /v1/actors/:actorId/professional-credentials`

Las altas y verificaciones administrativas requieren `x-pulso-admin-key` y `x-pulso-actor-id`. Un actor con sesión de campo también puede afirmar sus propios datos, pero no verificarlos.

## Evolución posterior

Cuando existan emisores e integraciones confiables, los avales y credenciales podrán interoperar con W3C Verifiable Credentials Data Model 2.0, OpenID for Verifiable Credential Issuance y OpenID for Verifiable Presentations. P0 conserva contratos y trazabilidad compatibles con esa dirección sin introducir una billetera digital como requisito de emergencia.

Referencias:

- <https://www.w3.org/TR/vc-data-model-2.0/>
- <https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0-final.html>
- <https://openid.net/specs/openid-4-verifiable-presentations-1_0.html>
- <https://registraduria.gov.co/-Acceso-a-la-base-de-datos-biometrica-825-.html>
