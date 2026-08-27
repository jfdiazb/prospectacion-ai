# Contexto comercial de ALMA

ALMA resuelve la marca y sus reglas desde `CommercialContext`, aislado por propietario. El preset inicial está en `backend/src/commercial/presets/amway.ts`; el normalizador, el motor de automatizaciones y los proveedores de IA permanecen genéricos.

`GET /api/v1/commercial-context/active` devuelve el contexto autenticado y crea el preset inicial si el propietario aún no tiene uno. `PUT /api/v1/commercial-context/active` permite reemplazarlo por una versión validada. El cambio no activa automatizaciones, proveedores ni envíos.

## Conocimiento oficial pendiente

El preset solo declara estructura comercial, reglas de seguridad y nombres básicos. Antes de usar respuestas que incluyan detalles se deben cargar y aprobar fuentes oficiales vigentes para:

- plan de compensación y declaraciones de ingresos;
- precios, catálogo y disponibilidad por país;
- requisitos, costos, políticas y condiciones;
- fichas y afirmaciones autorizadas de productos y Nutrilite;
- disclaimers regulatorios aplicables.

Mientras esa información permanezca en `informationPendingConfirmation`, Gemini recibe la instrucción de no inventarla y la respuesta debe quedar para revisión humana.

## Modo seguro

El contexto comercial no modifica modos de proveedores. Las propuestas de WhatsApp, Instagram y Facebook siguen en estado asistido y requieren aprobación; un score alto no equivale a intención de reunión.
