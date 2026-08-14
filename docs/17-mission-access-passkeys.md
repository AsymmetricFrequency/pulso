# Acceso de campo sin contraseñas

Estado: implementado en v0.2 inicial.

## Objetivo

Una persona de brigada debe pasar del mensaje de coordinación a su misión en segundos, sin crear cuenta, recordar contraseña ni completar formularios de identidad en campo.

## Flujo

1. Coordinación crea una asignación para una brigada y una zona.
2. Coordinación emite una invitación para un integrante activo mediante un endpoint protegido.
3. PULSO entrega un enlace `https://pulso.my/field?code=...` y un código de 10 caracteres que también puede convertirse en QR.
4. Al abrir el enlace, la aplicación canjea la invitación una sola vez y descarga el paquete de misión.
5. La persona confirma y guarda el paquete en el dispositivo para trabajar sin señal.
6. Si el dispositivo lo permite, puede registrar una passkey con huella, rostro o PIN para futuras validaciones. Este paso es opcional y nunca impide comenzar la visita.

## Controles de seguridad

- Los códigos tienen aproximadamente 50 bits de entropía, vencen y son de un solo uso.
- La base de datos conserva HMAC-SHA-256 del código y del token de sesión; no conserva los secretos en claro.
- La invitación está vinculada a una asignación, un actor y una membresía activa de brigada.
- Las sesiones son opacas, revocables, específicas del dispositivo y vencen a los 30 días.
- Los desafíos WebAuthn vencen a los cinco minutos y se consumen después de un intento.
- La verificación exige origen y RP ID exactos, además de verificación local de usuario.
- El canje permite cinco intentos por combinación de origen y código en una ventana de 15 minutos. PostgreSQL comparte el límite entre todas las instancias de la API.
- Cada canje exitoso o fallido deja un evento de auditoría.
- Emitir una invitación exige la llave de operaciones y un actor activo con rol `coordinator` o `incident_admin` en la misma emergencia.
- La llave de operaciones y el secreto HMAC son obligatorios en producción.

## Variables

```env
SITE_URL=https://pulso.my
MISSION_INVITATION_SECRET=<32-o-mas-caracteres-aleatorios>
MISSION_ADMIN_KEY=<llave-privada-de-operaciones>
WEBAUTHN_RP_ID=pulso.my
WEBAUTHN_ORIGIN=https://pulso.my
NEXT_PUBLIC_API_URL=https://api.pulso.my
```

## API

- `POST /v1/assignments/:assignmentId/invitations`
  - requiere `x-pulso-admin-key` y `x-pulso-actor-id` de coordinación;
  - devuelve el código solo al crearlo.
- `POST /v1/field-access/redeem`
  - recibe código y `deviceId`;
  - devuelve paquete de misión y token de sesión.
- `POST /v1/field-access/passkeys/registration/options`
  - requiere `Authorization: Bearer <sessionToken>`.
- `POST /v1/field-access/passkeys/registration/verify`
  - verifica y persiste la credencial pública.
- `POST /v1/field-access/passkeys/authentication/options`
  - inicia la recuperación passwordless de una misión guardada.
- `POST /v1/field-access/passkeys/authentication/verify`
  - verifica firma, origen, RP ID y contador; si todo coincide emite una sesión nueva.

## Límites conscientes

La v0.2 ya puede restablecer una sesión vencida mediante passkey cuando existe conexión. En modo emergencia sin señal, el paquete local sigue disponible y la identidad se vuelve a validar al recuperar conectividad. El paquete offline todavía no está cifrado con una clave vinculada al dispositivo. La llave de operaciones continúa como autenticación de arranque para coordinación, pero toda emisión queda autorizada y atribuida a un actor con rol válido; reemplazar esa llave por login passwordless de coordinación es el siguiente cierre.
