export class YouTubeLaunchFixtures {
  static root(
    id: string,
    videoId = 'video-1',
    text = 'Comentario de prueba',
    author = 'youtube-author-1'
  ) {
    return {
      id,
      snippet: {
        textOriginal: text,
        authorDisplayName: 'Autor ficticio',
        authorChannelId: { value: author },
        videoId,
        publishedAt: new Date().toISOString(),
      },
    };
  }
  static reply(
    id: string,
    rootCommentId: string,
    videoId = 'video-1',
    text = 'Respuesta de prueba',
    author = 'youtube-author-1'
  ) {
    return {
      comment: {
        id,
        snippet: {
          textOriginal: text,
          authorDisplayName: 'Autor ficticio',
          authorChannelId: { value: author },
          videoId,
          parentId: rootCommentId,
          publishedAt: new Date().toISOString(),
        },
      },
      rootCommentId,
    };
  }

  static associatedVideo(id = 'associated-comment', author = 'youtube-known-participant') {
    return this.root(id, 'video-1', 'Interacción en video asociado', author);
  }

  static unassociatedVideo(id = 'unassociated-comment', author = 'youtube-lead') {
    return this.root(id, 'video-unassociated', 'Interacción sin asociación', author);
  }

  static nonParticipant(id = 'non-participant-comment') {
    return this.root(id, 'video-1', 'Lead conocido no participante', 'youtube-non-participant');
  }

  static duplicate(id = 'duplicate-comment') {
    return this.root(id, 'video-1', 'Entrega duplicada', 'youtube-known-participant');
  }

  static ambiguousThread(id = 'ambiguous-reply') {
    return this.reply(id, 'unknown-root', 'video-unassociated', 'Hilo ambiguo');
  }

  static optOut(id = 'opt-out-comment', author = 'youtube-known-participant') {
    return this.root(id, 'video-1', 'No quiero continuar', author);
  }

  static terminalLaunch(id = 'terminal-launch-comment', author = 'youtube-known-participant') {
    return this.root(id, 'video-1', 'Comentario en lanzamiento terminal', author);
  }
}
