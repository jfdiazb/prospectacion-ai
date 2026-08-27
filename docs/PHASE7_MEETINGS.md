# Fase 7: reuniones con confirmación explícita

## Flujo

Con `SCHEDULING_MODE=zoom`, una intención conversacional explícita crea una solicitud y propone horarios calculados por `MeetingAvailabilityService`. Elegir una opción solo la reserva como selección; Zoom se invoca después de que el prospecto responda `confirmo`. Un score alto por sí solo no inicia el flujo.

Los estados nuevos son `potential`, `requested`, `pending_confirmation`, `confirmed`, `completed`, `cancelled`, `failed` y `reschedule_requested`. Se conservan los estados históricos de Zoom y Calendly por compatibilidad. En `ZOOM_MODE=mock`, una confirmación queda `pending_configuration` y nunca se presenta como una reunión real.

## Configurar disponibilidad

- `MEETING_AVAILABLE_DAYS`: días ISO simplificados, domingo `0` a sábado `6`.
- `MEETING_START_TIME` / `MEETING_END_TIME`: ventana local `HH:mm`.
- `MEETING_DURATION_MINUTES`: duración de cada opción.
- `MEETING_TIMEZONE`: zona IANA predeterminada.
- `MEETING_BUFFER_BEFORE_MINUTES` / `MEETING_BUFFER_AFTER_MINUTES`: separación entre reservas.
- `MEETING_HORIZON_DAYS`: días futuros examinados.
- `MEETING_MAX_OPTIONS`: opciones propuestas.

## Prueba local segura

1. Usar `SCHEDULING_MODE=zoom` y `ZOOM_MODE=mock`.
2. Enviar “Quiero agendar una reunión por Zoom”.
3. Comprobar que se propone disponibilidad sin `externalMeetingId`.
4. Responder con el número de una opción y luego `confirmo`.
5. Comprobar en CRM que el estado es `pending_configuration`; no se hizo tráfico externo.

Ejecutar `npm test -- --runInBand tests/meeting-phase7.test.ts` desde `backend` para validar intención, disponibilidad, selección, confirmación, idempotencia, fallo/reintento, cancelación, reprogramación, zona horaria, aislamiento, historial y eventos de automatización.

## Una prueba Zoom real controlada

Solo después de aprobar la activación externa: configurar `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` y `ZOOM_USER_ID`, cambiar temporalmente `ZOOM_MODE=live` en un entorno controlado y mantener los canales de mensajería asistidos. Usar un único prospecto de prueba, seleccionar una opción y confirmar una vez. Verificar `confirmed`, `externalMeetingId`, `joinUrl` y la reunión en Zoom; después restaurar `ZOOM_MODE=mock` si no se autoriza operación continua.

`startUrl` se guarda como campo protegido y no forma parte de las consultas normales del CRM. Los endpoints CRM filtran siempre por propietario. Reintentar, cancelar, reprogramar y completar se realizan desde controles autenticados.

## Limitaciones

La disponibilidad se calcula sobre la configuración y las reuniones guardadas por ALMA; no consulta todavía calendarios externos ocupados. Calendly conserva su flujo oficial y estados históricos. Actualizar o cancelar una reunión real depende de los permisos concedidos a la aplicación Zoom.
