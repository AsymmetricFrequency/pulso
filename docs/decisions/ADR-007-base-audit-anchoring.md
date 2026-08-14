# ADR-007: Base para anclaje público de auditoría

## Estado

Aceptada para piloto después del P0. PostgreSQL continúa como fuente de verdad.

## Decisión

PULSO usará **Base**, una L2 de Ethereum basada en OP Stack, para publicar pruebas agregadas de integridad. El piloto se desplegará primero en Base Sepolia y solo pasará a Base Mainnet después de auditoría del contrato y simulación de recuperación.

La integración será EVM y neutral a la cadena para permitir migrar o publicar una segunda copia si cambia el riesgo operativo.

## Qué se publica

Un contrato append-only recibirá por lote:

- `incidentCommitment`: identificador opaco derivado con sal, no el UUID público.
- `batchId` y versión del esquema.
- raíz Merkle de eventos de auditoría.
- hash del lote anterior.
- inicio y fin temporal del lote.
- URI de manifiesto verificable sin datos personales.

No se publicarán nombres, teléfonos, documentos, coordenadas de hogares, notas, fotografías, credenciales, montos individuales ni inventarios detallados.

## Flujo

1. PostgreSQL confirma la operación y su evento de auditoría encadenado.
2. La outbox agrupa hasta 1.000 eventos o quince minutos.
3. Un servicio relayer calcula la raíz Merkle y conserva el manifiesto firmado.
4. El relayer paga gas y publica el compromiso; ninguna brigada necesita wallet, ETH ni conexión blockchain.
5. El recibo se guarda en PostgreSQL con red, bloque y transacción.
6. Un verificador independiente puede reconstruir la raíz y compararla con la cadena.

La indisponibilidad de Base nunca bloquea atención, registro ni sincronización. Los lotes quedan en cola y se reintentan idempotentemente.

## Por qué Base

- Publica datos de la L2 en Ethereum y permite reconstrucción independiente.
- Compatibilidad EVM y herramientas maduras.
- Costos suficientemente bajos para anclar lotes, no eventos individuales.
- Pruebas de fallos sin permiso y control de actualizaciones distribuido mediante Security Council.
- El relayer absorbe costos y complejidad, preservando la experiencia de cero fricción.

## Alternativas

- **Celo L2:** excelente candidata si PULSO incorpora desembolsos en stablecoins porque permite pagar gas con activos como USDC. Su uso de EigenDA añade una dependencia distinta para disponibilidad de datos; por eso no es la primera opción para el registro público de integridad.
- **Polygon PoS:** económica y ampliamente soportada, pero su modelo de seguridad no ofrece la misma relación directa de rollup y disponibilidad de datos en Ethereum.
- **Ethereum L1:** máxima neutralidad, pero costo y variabilidad innecesarios para anclajes frecuentes.
- **Base de datos privada o blockchain permisionada:** no aporta verificación pública independiente suficiente.

## Custodia y contrato

El contrato no controlará donaciones en la primera etapa. La clave del relayer deberá vivir en HSM/MPC, con límites de gasto y rotación. El rol escritor será administrado por una multisig independiente de la aplicación. El contrato será pequeño, sin proxy actualizable y sin funciones para borrar compromisos.

Si más adelante existen desembolsos, se diseñarán como un subsistema separado con stablecoins reguladas, controles de cumplimiento, conciliación y aprobación múltiple. No se mezclará custodia financiera con el contrato de auditoría.

## Referencias primarias

- [Arquitectura del protocolo Base](https://docs.base.org/base-chain/specs/protocol/overview)
- [Costos de red en Base](https://docs.base.org/base-chain/network-information/network-fees)
- [Finalidad de transacciones en Base](https://docs.base.org/base-chain/network-information/transaction-finality)
- [Security Council de Base](https://docs.base.org/base-chain/security/security-council)
- [Arquitectura L2 de Celo](https://docs.celo.org/build-on-celo/cel2-architecture)
- [Abstracción de tarifas en Celo](https://docs.celo.org/build-on-celo/fee-abstraction/overview)
- [Introducción de Ethereum a las L2](https://ethereum.org/layer-2)
