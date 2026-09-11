import { act, render, screen, waitFor } from '@testing-library/react';
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

  it('bloquea consultas duplicadas durante una petición en curso', async () => {
    let resolveRequest!: (value: Awaited<ReturnType<typeof whatsappDiagnosticsService.inbound>>) => void;
    vi.mocked(whatsappDiagnosticsService.inbound).mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    render(<WhatsAppLiveDiagnostics />);
    await userEvent.type(screen.getByLabelText('Texto de la prueba'), 'prueba');

    const button = screen.getByRole('button', { name: 'Verificar inbound' });
    button.click();
    button.click();
    await waitFor(() => expect(whatsappDiagnosticsService.inbound).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: /Cargando/ })).toBeDisabled();

    await act(async () => resolveRequest({
        inboundEventCount: 0, uniqueExternalEventCount: 0, messagePersistenceCount: 0,
        leadMatchCount: 0, conversationMatchCount: 0, events: [], outboundMode: 'mock', autoReplyEnabled: false,
      }));
    await screen.findByText('WHATSAPP INBOUND LIVE: FAIL');
  });

  it.each([
    [401, 'La sesión administrativa expiró. Inicia sesión nuevamente.'],
    [403, 'Tu usuario no tiene autorización administrativa para este diagnóstico.'],
    [404, 'El diagnóstico WhatsApp no está disponible en este despliegue.'],
    [500, 'El diagnóstico no pudo completarse. No se modificó ningún dato.'],
  ])('presenta un error seguro para HTTP %i', async (status, message) => {
    vi.mocked(whatsappDiagnosticsService.inbound).mockRejectedValue({ response: { status, data: { secret: 'oculto' } } });
    render(<WhatsAppLiveDiagnostics />);
    await userEvent.type(screen.getByLabelText('Texto de la prueba'), 'prueba');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar inbound' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText('oculto')).not.toBeInTheDocument();
  });
});
