import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppLiveDiagnostics } from './WhatsAppLiveDiagnostics';
import { whatsappDiagnosticsService } from '@services/whatsappDiagnosticsService';

vi.mock('@services/whatsappDiagnosticsService', () => ({
  whatsappDiagnosticsService: { inbound: vi.fn() },
}));

describe('WhatsAppLiveDiagnostics', () => {
  beforeEach(() => {
    vi.mocked(whatsappDiagnosticsService.inbound).mockResolvedValue({
      inboundEventCount: 1,
      uniqueExternalEventCount: 1,
      messagePersistenceCount: 1,
      leadMatchCount: 1,
      conversationMatchCount: 1,
      events: [{ processingState: 'completed', conversationRecorded: true }],
      outboundMode: 'mock',
      autoReplyEnabled: false,
    });
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    });
  });

  it('consulta solo con ventana y hash, y presenta el resultado consolidado', async () => {
    const plaintext = 'Hola, quiero mas informacion.';
    render(<WhatsAppLiveDiagnostics />);

    await userEvent.type(screen.getByLabelText('Texto de la prueba'), plaintext);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar inbound' }));

    await waitFor(() => expect(whatsappDiagnosticsService.inbound).toHaveBeenCalledOnce());
    const params = vi.mocked(whatsappDiagnosticsService.inbound).mock.calls[0][0];
    expect(params).toEqual({
      from: '2026-08-29T22:50:00.000Z',
      to: '2026-08-29T22:56:00.000Z',
      textSha256: '0'.repeat(64),
    });
    expect(JSON.stringify(params)).not.toContain(plaintext);
    expect(screen.getByText('WHATSAPP INBOUND LIVE: PASS')).toBeInTheDocument();
    expect(screen.getByText('MOCK')).toBeInTheDocument();
    expect(screen.getByText('FALSE')).toBeInTheDocument();
    expect(screen.getByLabelText('Texto de la prueba')).toHaveValue('');
  });
});
