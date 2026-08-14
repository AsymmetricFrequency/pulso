# Experiencia de campo con cero fricción

La facilidad de uso es un requisito operacional y de seguridad. Una brigada puede estar bajo presión, usar un teléfono prestado, tener poca señal o poca experiencia digital. El sistema debe reducir decisiones y escritura sin ocultar consecuencias.

## Objetivos medibles

- Abrir una misión desde enlace o QR en menos de 30 segundos.
- Abrirla con código manual en menos de 60 segundos.
- Comenzar una visita con máximo tres decisiones explícitas.
- Mantener todos los controles primarios con un área táctil mínima de 48 px.
- Permitir completar las funciones esenciales sin conectividad continua.
- Evitar contraseñas durante la activación urgente de una misión.

## Flujo P0

```text
abrir enlace/QR o escribir código → confirmar misión
→ guardar paquete offline → comenzar visita
```

Cada pantalla hace una pregunta. La interfaz muestra siempre el estado de conexión y utiliza lenguaje cotidiano: “Guardar para usar sin conexión” en lugar de “persistir paquete”, y “Guardado aquí” en lugar de “mutación pendiente”.

## Identidad progresiva

La ausencia de contraseña no significa ausencia de seguridad:

1. El enlace, QR o código corto identifica una invitación limitada por misión, actor y vencimiento.
2. El dispositivo registra una identidad local estable para reintentos e idempotencia.
3. Una passkey o biometría se solicita una sola vez al vincular el dispositivo, no en cada visita.
4. Acciones de mayor impacto —certificar, aprobar ayuda, cerrar una emergencia o ajustar inventario— requieren confirmación reforzada.
5. Siempre existe una recuperación asistida por coordinación para dispositivos perdidos o personas sin biometría.

## Reglas de interfaz

- Una acción primaria por pantalla.
- Sin menús profundos durante el trabajo de campo.
- Valores conocidos vienen de la misión; no se vuelven a pedir.
- Mensajes explican qué ocurrió y qué debe hacer la persona.
- El color nunca es la única señal de estado.
- El avance se guarda antes de intentar sincronizar.
- Una pérdida de señal no borra ni bloquea la visita.
- Toda acción destructiva o irreversible se confirma con lenguaje específico.
- La interfaz debe funcionar con zoom, lector de pantalla y navegación por teclado.

## Implementación actual

La ruta `/field` implementa el prototipo móvil completo: código de misión, confirmación, caché IndexedDB, comienzo idempotente y lista táctil de trabajo. La entrada desde Pulso Operaciones muestra las visitas pendientes de sincronización.

Los datos de la misión todavía son sintéticos. El siguiente incremento debe reemplazarlos por un paquete firmado emitido por la API y unir el enlace de invitación con el actor y la asignación reales.

## Validación necesaria

Antes de declarar estable el flujo se probará con:

- brigadistas con distintos niveles de alfabetización digital;
- teléfonos pequeños y equipos de gama baja;
- conectividad lenta, intermitente y completamente ausente;
- luz solar intensa y uso con una sola mano;
- español claro y variantes regionales;
- lector de pantalla y ampliación de texto.

Las métricas mínimas serán tiempo hasta comenzar, errores por paso, abandonos, solicitudes de ayuda y operaciones duplicadas.
