# Programa de auditoría en Solana

## Estado

El programa mínimo `pulso_anchor` está implementado en Anchor, compila para SBF y fue validado con pruebas unitarias y transacciones reales sobre un validador Solana local.

- **Program ID del piloto:** `DBfKewHG6MgNjuiRhUhMUZrgq2Qh3ZRjwbCVxBbBodHx`
- **Red habilitada actualmente:** local; Devnet es el siguiente entorno.
- **Datos personales en cadena:** ninguno.
- **Custodia de fondos:** ninguna.

## Responsabilidad

Solana no reemplaza PostgreSQL/PostGIS ni participa en el flujo crítico de atención. El programa conserva pruebas públicas de integridad de lotes ya confirmados por PULSO. Si la red o el relayer fallan, el trabajo de campo continúa y el lote se reintenta después.

## Cuentas

### `Registry`

Una PDA por incidente opaco, derivada de `registry + incidentCommitment`. Conserva:

- autoridad autorizada;
- siguiente número de secuencia;
- última raíz Merkle;
- cierre temporal del último lote;
- versión y marcas de tiempo.

### `AuditBatch`

Una PDA inmutable por lote, derivada de `batch + registry + sequence`. Conserva la raíz Merkle, la raíz anterior, el hash del manifiesto, la versión del esquema y el periodo cubierto.

Crear una cuenta separada por lote evita redimensionar una cuenta creciente y permite consultar o probar un lote de forma independiente.

## Instrucciones

1. `initialize_registry`: crea el registro de un incidente y fija su autoridad.
2. `append_batch`: crea exactamente el siguiente lote y rechaza saltos, raíces anteriores incorrectas, periodos solapados y hashes vacíos.
3. `rotate_authority`: transfiere la autoridad del registro. En producción, la nueva autoridad debe ser una multisig o política MPC, no una llave personal.

El pagador de comisiones y la autoridad son firmantes separados. Por eso PULSO puede patrocinar las comisiones sin pedir wallet, SOL ni conocimiento de blockchain a brigadistas o beneficiarios.

## Verificación local

Desde la raíz del repositorio:

```bash
pnpm --filter @pulso/solana build
pnpm --filter @pulso/solana typecheck
pnpm --filter @pulso/solana test
pnpm test:solana:integration
```

La prueba de integración inicia un validador local, despliega el programa, crea un registro, ancla lotes válidos y comprueba que una secuencia saltada o una cadena rota sean rechazadas sin alterar el estado.

## Preparación de Devnet

Antes del primer despliegue:

1. Recuperar la llave de despliegue del piloto desde almacenamiento seguro en `blockchain/solana/target/deploy/pulso_anchor-keypair.json`. Nunca se versiona.
2. Confirmar que su dirección coincide con el Program ID del código y `Anchor.toml`.
3. Configurar un pagador exclusivo para Devnet y obtener SOL de prueba.
4. Ejecutar nuevamente todas las pruebas locales.
5. Desplegar con `anchor deploy --provider.cluster devnet`.
6. Registrar firma, slot, hash del binario, commit de Git y versión del IDL.
7. Ejecutar una prueba de inicialización y dos lotes enlazados en Devnet.

Devnet no autoriza Mainnet. Para producción todavía son obligatorios auditoría especializada, multisig de actualización, relayer protegido con HSM/MPC, límites operacionales, dos RPC independientes y simulación previa de cada transacción.

## Próximo componente

El siguiente incremento es el relayer idempotente: consume la outbox de auditoría, construye el manifiesto y la raíz Merkle, simula y envía `append_batch`, espera confirmación `finalized` y registra firma, slot e intentos sin bloquear ninguna operación de emergencia.
