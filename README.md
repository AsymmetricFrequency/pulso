# PULSO ATLAS

**Infraestructura abierta para convertir señales del territorio en acción verificable durante emergencias y recuperación.**

PULSO ATLAS es una plataforma local-first para coordinar cobertura territorial, brigadas, casos, necesidades, evidencia y validaciones cuando la conectividad es limitada y la información cambia rápidamente.

La primera implementación está enfocada en Colombia. El protocolo y el modelo de datos se diseñan para adaptarse posteriormente a terremotos, inundaciones, incendios, huracanes y otras emergencias en cualquier país.

## Decisión central

El MVP no comienza con blockchain, tokenización ni distribución de dinero. Comienza resolviendo cinco preguntas operacionales:

1. ¿Qué zonas fueron visitadas?
2. ¿Qué zonas siguen sin verificar?
3. ¿Qué daños y necesidades fueron observados?
4. ¿Quién produjo o validó cada dato?
5. ¿Qué evidencia respalda cada decisión?

## Componentes

- **Atlas Field:** aplicación PWA offline para brigadas.
- **Atlas Operations:** consola privada de coordinación y revisión.
- **Atlas Map:** mapa de cobertura, daño, acceso y necesidades.
- **Recovery Passport:** expediente versionado de cada caso o activo.
- **Atlas Verify:** identidad, certificaciones, evidencia y revisión.
- **Pulso Atlas Protocol:** contratos abiertos de datos, sincronización y auditoría.

## Arquitectura propuesta

- Next.js + TypeScript para las experiencias web y de campo.
- IndexedDB para captura offline.
- Fastify + TypeScript para la API modular.
- PostgreSQL + PostGIS como fuente de verdad territorial.
- Almacenamiento compatible con S3 para fotografías y documentos.
- Redis + BullMQ para procesamiento asíncrono.
- OIDC para autenticación portable.
- OpenAPI para interoperabilidad.

La implementación inicial será un **monolito modular con workers**, desplegado en contenedores. Los módulos podrán separarse posteriormente si el volumen o las necesidades operacionales lo justifican.

## Documentación

- [Visión y principios](docs/00-vision.md)
- [MVP de emergencia](docs/01-emergency-mvp.md)
- [Arquitectura técnica](docs/02-technical-architecture.md)
- [Modelo de datos](docs/03-data-model.md)
- [Sincronización offline](docs/04-offline-sync.md)
- [Confianza, fraude y privacidad](docs/05-trust-fraud-privacy.md)
- [Investigación y despliegue Colombia](docs/06-colombia-response.md)
- [Plan de construcción](docs/07-roadmap.md)
- [Decisiones de arquitectura](docs/decisions/)
- [Documento fundacional v0.2](docs/foundation/RecoveryChain_Protocol_v0.2.docx)
- [Mapa preliminar de afectación](research/colombia-2026/mapa-impacto-terremoto.html)

## Estado

El proyecto se encuentra en construcción del P0. Las cifras de emergencia incluidas en la investigación son preliminares y deben conservar su fecha, fuente y nivel de confianza.

## Desarrollo

Requisitos: Node.js 22 o superior y pnpm 10. Docker es opcional para levantar PostgreSQL/PostGIS y Redis localmente.

```bash
pnpm install
cp .env.example .env
pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Salud de API: `GET /health`
- Incidentes: `GET|POST /v1/incidents`

Para verificar todo el repositorio:

```bash
pnpm check
```

Más información en [la guía de desarrollo](docs/08-development.md).

## Marca

- Marca de trabajo: **PULSO ATLAS**
- Implementación inicial: **PULSO ATLAS Colombia**
- Dominio candidato: `pulsoatlas.org` — pendiente de registro y validación jurídica.

## Licencia

La licencia del código y la licencia de datos se definirán antes de aceptar contribuciones externas. No debe asumirse una licencia hasta que exista un archivo `LICENSE` aprobado.
