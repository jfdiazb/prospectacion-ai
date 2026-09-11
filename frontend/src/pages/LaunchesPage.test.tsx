import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LaunchesPage } from './LaunchesPage';
import { launchService } from '@services/launchService';

vi.mock('@components/AppLayout', () => ({
  AppLayout: ({ children }: any) => <main>{children}</main>,
}));
vi.mock('@services/launchService', async importOriginal => {
  const original: any = await importOriginal();
  return {
    ...original,
    launchService: {
      list: vi.fn(),
      detail: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      transition: vi.fn(),
      saveSegment: vi.fn(),
      previewSegment: vi.fn(),
      select: vi.fn(),
      addManual: vi.fn(),
      operation: vi.fn(),
      attendance: vi.fn(),
      correct: vi.fn(),
    },
  };
});
vi.mock('@services/crmService', () => ({
  crmService: {
    editProposal: vi.fn(),
    sendProposal: vi.fn(),
    discardProposal: vi.fn(),
    setTaskStatus: vi.fn(),
  },
}));

const launch: any = {
  _id: 'l1',
  name: 'Evento ALMA',
  typeKey: 'webinar',
  status: 'scheduled',
  timezone: 'America/Bogota',
  eventStartsAt: '2027-08-10T23:00:00Z',
  allowedChannels: ['whatsapp'],
  selectionMode: 'assisted',
  lifecycleVersion: 2,
  configurationVersion: 1,
  metrics: {
    selected: 1,
    registered: 1,
    confirmed: 0,
    attended: 0,
    notAttended: 0,
    unknown: 1,
    pendingActions: 1,
  },
};
const detail: any = {
  launch,
  metrics: launch.metrics,
  participants: [
    {
      _id: 'p1',
      leadId: 'lead1',
      source: 'segment',
      entryChannel: 'whatsapp',
      stage: { status: 'selected' },
      invitation: { status: 'invited' },
      registration: { status: 'registered' },
      confirmation: { status: 'unknown' },
      attendance: { status: 'unknown' },
      outcome: { status: 'pending' },
      lead: {
        fullName: 'Ana Prospecto',
        currentChannel: 'whatsapp',
        score: 72,
        interestLevel: 'warm',
        normalizedIntent: 'interest',
        tags: ['opt_out'],
      },
      pendingAction: { kind: 'event_reminder' },
    },
  ],
  actions: [
    {
      _id: 'a1',
      kind: 'event_reminder',
      status: 'completed',
      priority: 'high',
      dueAt: '2027-08-10T22:00:00Z',
      reason: 'event_window',
      proposedChannel: 'whatsapp',
      taskId: { _id: 't1', title: 'Revisar recordatorio', status: 'pending' },
      proposalId: {
        _id: 'pr1',
        text: 'Mensaje para revisar',
        status: 'proposed',
        platform: 'whatsapp',
        conversationId: 'c1',
      },
    },
    {
      _id: 'a2',
      kind: 'invitation',
      status: 'cancelled',
      priority: 'medium',
      dueAt: '2027-08-01T00:00:00Z',
      invalidationReason: 'participant_changed',
    },
  ],
  events: [
    {
      _id: 'e1',
      eventType: 'launch.participant_registered',
      source: 'manual',
      actor: 'owner',
      occurredAt: '2027-08-01T00:00:00Z',
      evidence: { type: 'manual', note: 'Registro verificado' },
    },
  ],
};

describe('LaunchesPage L5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (launchService.list as any).mockResolvedValue([launch]);
    (launchService.detail as any).mockResolvedValue(detail);
    (launchService.create as any).mockResolvedValue(launch);
    (launchService.operation as any).mockResolvedValue({});
    (launchService.attendance as any).mockResolvedValue({});
    (launchService.saveSegment as any).mockResolvedValue({ version: 3 });
    (launchService.previewSegment as any).mockResolvedValue({ version: 3, items: [] });
  });
  it('lists, filters and opens real launch detail with metrics and participants', async () => {
    render(
      <MemoryRouter>
        <LaunchesPage />
      </MemoryRouter>
    );
    expect(await screen.findByText('Evento ALMA')).toBeInTheDocument();
    expect(screen.getByText('1 acciones pendientes')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'scheduled');
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }));
    expect(launchService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'scheduled' })
    );
    await userEvent.click(screen.getByText('Evento ALMA'));
    expect(await screen.findByText('Ana Prospecto')).toBeInTheDocument();
    expect(screen.getByText(/Opt-out/)).toBeInTheDocument();
  });
  it('operates evidence-backed registration and shows actions, proposal, invalidation and audit', async () => {
    render(
      <MemoryRouter>
        <LaunchesPage />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByText('Evento ALMA'));
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar' }));
    expect(launchService.operation).toHaveBeenCalledWith(
      'l1',
      'p1',
      'register',
      expect.any(String)
    );
    await userEvent.click(screen.getByRole('button', { name: 'Acciones y CRM' }));
    expect(screen.getByText('Mensaje para revisar')).toBeInTheDocument();
    expect(screen.getByText(/Invalidada: participant_changed/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Auditoría' }));
    expect(screen.getByText('launch.participant_registered')).toBeInTheDocument();
    expect(screen.getByText('Registro verificado')).toBeInTheDocument();
  });
  it('creates a launch and surfaces backend validation errors', async () => {
    render(
      <MemoryRouter>
        <LaunchesPage />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: /Crear/ }));
    await userEvent.type(screen.getByLabelText('Nombre'), 'Nuevo lanzamiento');
    fireEvent.change(screen.getByLabelText('Inicio del evento'), {
      target: { value: '2027-09-10T18:00' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(launchService.create).toHaveBeenCalled());
    (launchService.transition as any).mockRejectedValueOnce({
      response: { data: { message: 'Conflicto concurrente' } },
    });
    await userEvent.click(screen.getByRole('button', { name: /Avanzar a prelaunch/ }));
    expect(await screen.findByText('Conflicto concurrente')).toBeInTheDocument();
  });
  it('adds and removes criteria and always releases the segmentation loading state', async () => {
    render(<MemoryRouter><LaunchesPage /></MemoryRouter>);
    await userEvent.click(await screen.findByText('Evento ALMA'));
    await userEvent.click(screen.getByRole('button', { name: 'Segmentación' }));
    await userEvent.click(screen.getByRole('button', { name: 'Añadir criterio' }));
    expect(screen.getAllByLabelText('Campo')).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[1]);
    expect(screen.getAllByLabelText('Campo')).toHaveLength(1);
    (launchService.saveSegment as any).mockRejectedValueOnce({ response: { data: { message: 'Criterio inválido' } } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar y previsualizar' }));
    expect(await screen.findByText('Criterio inválido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar y previsualizar' })).toBeEnabled();
  });
});
