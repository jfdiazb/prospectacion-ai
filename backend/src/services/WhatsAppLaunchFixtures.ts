export class WhatsAppLaunchFixtures {
  static text(id: string, body = 'Mensaje de prueba', waId = '573001112233') {
    return {
      from: waId,
      id,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: { body },
    };
  }
  static button(id: string, controlId: string, title = 'Confirmar', waId = '573001112233') {
    return {
      from: waId,
      id,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'interactive',
      interactive: { type: 'button_reply', button_reply: { id: controlId, title } },
    };
  }
  static list(id: string, controlId: string, title = 'Seleccionar', waId = '573001112233') {
    return {
      from: waId,
      id,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'interactive',
      interactive: { type: 'list_reply', list_reply: { id: controlId, title } },
    };
  }
  static media(id: string, type: 'image' | 'audio' | 'video' | 'document' = 'image') {
    return {
      from: '573001112233',
      id,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type,
      [type]: {
        id: `media-${id}`,
        mime_type: type === 'image' ? 'image/jpeg' : 'application/octet-stream',
        sha256: 'fixture-sha256',
        caption: type === 'image' ? 'Imagen de prueba' : undefined,
      },
    };
  }
  static metadata(phoneNumberId = 'phone-number-1') {
    return { phone_number_id: phoneNumberId, display_phone_number: '15550001111' };
  }
  static control(
    action: 'registration' | 'confirmation' | 'interaction',
    launchId: string,
    token: string
  ) {
    return `alma-launch:v1:${action}:${launchId}:${token}`;
  }
  static payload(message: any, metadata = this.metadata()) {
    return {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: { messaging_product: 'whatsapp', metadata, messages: [message] },
            },
          ],
        },
      ],
    };
  }
}
