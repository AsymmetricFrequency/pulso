# ADR-007: Solana como única blockchain de PULSO

## Estado

Aceptada para implementación posterior al P0. PostgreSQL continúa como fuente de verdad y ninguna función de emergencia depende de Solana.

## Decisión

PULSO utilizará **Solana** como única blockchain prevista. La primera integración publicará compromisos criptográficos de auditoría en Devnet. Solo después de validar seguridad, continuidad, costos y recuperación se considerará Mainnet.

La misma red podrá soportar posteriormente donaciones y desembolsos en USDC. No se incorporarán Base, Celo, Polygon ni otra cadena en paralelo durante esta etapa.

## Separación de responsabilidades

| Capa | Responsabilidad |
|---|---|
| PostgreSQL/PostGIS | Fuente de verdad operacional, territorial y financiera interna |
| Almacenamiento de objetos | Fotografías, documentos y manifiestos cifrados |
| Auditoría PULSO | Eventos append-only, hashes encadenados y raíces Merkle |
| Relayer PULSO | Firma, patrocinio de comisiones, reintentos y confirmación finalizada |
| Solana | Prueba pública de integridad y, posteriormente, movimientos USDC autorizados |

## Qué se publica

El programa de anclaje recibirá únicamente:

- `incidentCommitment`: compromiso opaco derivado con una sal separada, nunca el UUID público.
- secuencia y versión del esquema.
- raíz Merkle del lote.
- hash del lote anterior.
- inicio y fin temporal del lote.
- hash del manifiesto verificable.

No se publicarán nombres, teléfonos, documentos, coordenadas de hogares, notas, fotografías, credenciales, historiales médicos, inventarios detallados ni identidades de beneficiarios.

## Programa mínimo

El programa `pulso_anchor` será pequeño y append-only. Tendrá tres instrucciones:

1. `initialize_registry`: crea el registro PDA de un incidente y fija la autoridad inicial.
2. `append_batch`: acepta exactamente la siguiente secuencia, valida el hash anterior y agrega el compromiso.
3. `rotate_authority`: cambia la autoridad mediante una multisig y deja el evento correspondiente.

No tendrá instrucciones para editar o borrar lotes. Los registros se segmentarán cuando alcancen el tamaño máximo definido, enlazando cada segmento con el anterior. El programa no custodiará USDC ni donaciones.

## Flujo de anclaje

1. PostgreSQL confirma la operación y su evento de auditoría en la misma transacción.
2. La outbox agrupa hasta 1.000 eventos o una hora, lo que ocurra primero.
3. Un worker construye la raíz Merkle y firma el manifiesto completo.
4. El relayer crea y simula la transacción, paga la comisión y llama `append_batch`.
5. PULSO espera compromiso `finalized`, almacena firma, slot y proveedor RPC utilizado.
6. Un verificador independiente reconstruye la raíz y la compara con Solana.

Una falla de Solana, del relayer o de los RPC nunca bloquea registro, sincronización, atención ni entrega. El lote queda en cola y se reintenta idempotentemente con un blockhash vigente.

## Experiencia de cero fricción

Brigadas, comunidades y beneficiarios no necesitan wallet ni SOL. El relayer es el `fee payer`. Para futuros pagos, PULSO podrá patrocinar la comisión mientras el usuario autoriza únicamente el movimiento de USDC.

## Infraestructura obligatoria

- Dos proveedores RPC independientes en producción; los endpoints públicos no se usarán para tráfico crítico.
- Confirmación `finalized` antes de considerar anclado un lote.
- Clave del relayer en HSM/MPC con límites de gasto, rotación y alertas.
- Multisig separada para autoridad del programa.
- Archivo propio de transacciones, manifiestos y pruebas Merkle; no depender de un explorador.
- Conciliación que detecte secuencias faltantes, duplicadas o firmas no finalizadas.

## Donaciones financieras

USDC no se incorporará al contrato de auditoría. Se diseñará como módulo independiente sobre Solana cuando exista un flujo jurídico y operacional validado. Exigirá:

- conciliación contable fuera de cadena;
- aprobación múltiple para desembolsos;
- límites por rol, incidente y periodo;
- tratamiento de reembolsos y transacciones fallidas;
- controles regulatorios aplicables;
- comprobantes que no revelen información sensible.

## Razones

- Una sola red reduce llaves, proveedores, conciliaciones y especializaciones.
- Solana permite separar al firmante del pagador de comisiones y patrocinar la experiencia.
- Sus costos y capacidad permiten anclajes, USDC y alto volumen sin cambiar de red.
- Una raíz Merkle cabe ampliamente dentro del límite de una transacción.
- El programa puede permanecer mínimo, mientras PostgreSQL conserva toda la lógica operacional.

## Riesgos aceptados

- Solana no hereda la seguridad de Ethereum; depende de su propio consenso y conjunto de validadores.
- Las transacciones usan blockhashes recientes y pueden expirar, por lo que el relayer debe reconstruirlas y reintentarlas.
- Los RPC públicos tienen límites y no son adecuados para producción.
- Los programas Solana requieren revisión especializada en Rust/Anchor y su modelo de cuentas.
- La consulta histórica exige archivo e indexación propios para no depender de retención de terceros.

## Referencias primarias

- [Conceptos fundamentales de Solana](https://solana.com/docs/core)
- [Comisiones en Solana](https://solana.com/docs/core/fees)
- [Patrocinio y abstracción de comisiones](https://solana.com/docs/payments/send-payments/payment-processing/fee-abstraction)
- [Confirmación y expiración de transacciones](https://solana.com/uk/developers/guides/advanced/confirmation)
- [Clusters y endpoints RPC](https://solana.com/docs/references/clusters)
- [Despliegue de programas](https://solana.com/docs/programs/deploying)
