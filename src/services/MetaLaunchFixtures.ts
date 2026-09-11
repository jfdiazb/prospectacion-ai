export class MetaLaunchFixtures {
  static instagramComment(id: string, contentId = 'ig-post-1', text = 'Comentario de prueba') {
    return {
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          changes: [
            {
              field: 'comments',
              value: {
                id,
                text,
                from: { id: 'ig-user-1' },
                platform: 'instagram',
                media: { id: contentId },
                timestamp: Math.floor(Date.now() / 1000),
              },
            },
          ],
        },
      ],
    };
  }

  static facebookComment(id: string, contentId = 'fb-post-1', text = 'Comentario de prueba') {
    return {
      object: 'page',
      entry: [
        {
          id: 'fb-page-1',
          changes: [
            {
              field: 'comments',
              value: {
                id,
                text,
                from: { id: 'fb-user-1' },
                post_id: contentId,
                created_time: Math.floor(Date.now() / 1000),
              },
            },
          ],
        },
      ],
    };
  }

  static instagramDm(id: string, options: { token?: string; replyTo?: string } = {}) {
    return {
      object: 'instagram',
      entry: [
        {
          id: 'ig-account-1',
          messaging: [
            {
              sender: { id: 'ig-user-1' },
              recipient: { id: 'ig-account-1' },
              timestamp: Date.now(),
              message: {
                mid: id,
                text: 'DM de prueba',
                reply_to: options.replyTo ? { mid: options.replyTo } : undefined,
              },
              referral: options.token ? { ref: `alma-launch:${options.token}` } : undefined,
            },
          ],
        },
      ],
    };
  }

  static messenger(id: string, replyTo?: string) {
    return {
      object: 'page',
      entry: [
        {
          id: 'fb-page-1',
          messaging: [
            {
              sender: { id: 'fb-psid-1' },
              recipient: { id: 'fb-page-1' },
              timestamp: Date.now(),
              message: {
                mid: id,
                text: 'Messenger de prueba',
                reply_to: replyTo ? { mid: replyTo } : undefined,
              },
            },
          ],
        },
      ],
    };
  }
}
