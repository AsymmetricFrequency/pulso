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
- La llave de emisión y el secreto HMAC son obligatorios en producción.

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
  - requiere `x-pulso-admin-key`;
  - devuelve el código solo al crearlo.
- `POST /v1/field-access/redeem`
  - recibe código y `deviceId`;
  - devuelve paquete de misión y token de sesión.
- `POST /v1/field-access/passkeys/registration/options`
  - requiere `Authorization: Bearer <sessionToken>`.
- `POST /v1/field-access/passkeys/registration/verify`
  - verifica y persiste la credencial pública.

## Límites conscientes

La v0.2 registra la passkey, pero todavía no cifra el paquete offline ni restablece una sesión mediante esa passkey. La autenticación posterior, la recuperación por pérdida del teléfono y, si se exige confidencialidad local, el cifrado vinculado al dispositivo quedan para el siguiente incremento. Antes de exposición pública también se debe añadir limitación distribuida de intentos al canje de códigos y reemplazar la llave administrativa compartida por autenticación de coordinación basada en roles.
