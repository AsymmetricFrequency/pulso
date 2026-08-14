# Acceso y tablero operacional P0

## Decisión

El tablero real vive en `/operations` y no recibe llaves administrativas. El acceso inicial usa un código de diez caracteres, de un solo uso y corta duración, emitido por un coordinador o administrador autorizado.

Al canjearlo, el servidor deriva la persona, el rol y el incidente. La sesión dura doce horas y queda vinculada al dispositivo. Los códigos y tokens se almacenan como HMAC-SHA-256, nunca en texto claro.

## Autorización

Solo roles activos `coordinator`, `auditor` e `incident_admin` pueden abrir el tablero. La ruta agregada valida que el incidente solicitado coincida con el de la sesión:

- `POST /v1/incidents/:incidentId/operations-access/invitations`
- `POST /v1/operations-access/redeem`
- `GET /v1/operations/incidents/:incidentId/assessment-summary`

La emisión continúa siendo una acción de backend y exige la llave de arranque más un coordinador o administrador del mismo incidente. Esa llave nunca se incorpora al navegador.

## Privacidad

El tablero consolida cantidades, gravedad, urgencia, daños, necesidades y presión territorial. No devuelve nombres de hogares, notas, fotografías ni identificadores de personas.

## Persistencia y auditoría

La migración `010_operations_access.sql` crea invitaciones, sesiones y eventos de acceso. Los intentos se limitan a cinco por código e IP durante quince minutos. Cada canje exitoso o fallido deja rastro.

## Evolución inmediata

La siguiente iteración añadirá passkeys para reingreso biométrico y revocación visible de sesiones. El código seguirá siendo el mecanismo de recuperación, no una contraseña permanente.
