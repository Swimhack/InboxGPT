import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChannelGrid, type ProviderAvailability } from '@/components/onboarding/channel-grid';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({ get: mockGet }),
}));

const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

jest.mock('@/components/accounts/add-account-dialog', () => ({
  AddAccountDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="imap-dialog-open">imap dialog</div> : null,
}));

Object.assign(navigator, {
  clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
});

global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ byProvider: {} }) });

const ALL_READY: ProviderAvailability = {
  gmail: { ready: true },
  outlook: { ready: true },
  imap: { ready: true },
  slack: { ready: true },
  discord: { ready: true },
  signal: { ready: false, reason: 'Soon' },
  twilio: { ready: false, reason: 'Soon' },
  whatsapp: { ready: false, reason: 'Soon' },
  meta_ig: { ready: false, reason: 'Soon' },
  meta_fb: { ready: false, reason: 'Soon' },
  x: { ready: false, reason: 'Soon' },
  linkedin: { ready: false, reason: 'Soon' },
};

describe('ChannelGrid', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReturnValue(null);
  });

  it('renders all 12 channels grouped into 4 categories', () => {
    render(
      <ChannelGrid initialConnections={{}} availability={ALL_READY} appBaseUrl="https://x" />
    );
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Team chat')).toBeInTheDocument();
    expect(screen.getByText('SMS & voice')).toBeInTheDocument();
    expect(screen.getByText('Social & messaging')).toBeInTheDocument();

    for (const id of [
      'gmail',
      'outlook',
      'imap',
      'slack',
      'discord',
      'signal',
      'twilio',
      'whatsapp',
      'meta_ig',
      'meta_fb',
      'x',
      'linkedin',
    ]) {
      expect(screen.getByTestId(`channel-card-${id}`)).toBeInTheDocument();
    }
  });

  it('downgrades Outlook to coming-soon when availability says not ready', () => {
    const availability: ProviderAvailability = {
      ...ALL_READY,
      outlook: { ready: false, reason: 'Set AZURE_AD_CLIENT_ID to enable Outlook.' },
    };
    render(<ChannelGrid initialConnections={{}} availability={availability} appBaseUrl="https://x" />);
    const outlookBtn = screen.getByTestId('channel-connect-outlook');
    expect(outlookBtn).toBeDisabled();
    expect(outlookBtn).toHaveTextContent('Coming soon');
  });

  it('renders Connected state with the email address when initial connections include gmail', () => {
    render(
      <ChannelGrid
        initialConnections={{
          gmail: { count: 1, accounts: [{ email: 'alice@example.com', name: 'Alice' }] },
        }}
        availability={ALL_READY}
        appBaseUrl="https://x"
      />
    );
    const gmailBtn = screen.getByTestId('channel-connect-gmail');
    expect(gmailBtn).toHaveTextContent('Add another');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('sets busy state when clicking a Ready oauth card (smoke test)', () => {
    render(
      <ChannelGrid initialConnections={{}} availability={ALL_READY} appBaseUrl="https://x" />
    );
    const button = screen.getByTestId('channel-connect-outlook');
    expect(() => fireEvent.click(button)).not.toThrow();
    expect(button).toBeDisabled();
  });

  it('opens IMAP dialog when clicking IMAP card', () => {
    render(
      <ChannelGrid initialConnections={{}} availability={ALL_READY} appBaseUrl="https://x" />
    );
    fireEvent.click(screen.getByTestId('channel-connect-imap'));
    expect(screen.getByTestId('imap-dialog-open')).toBeInTheDocument();
  });

  it('shows skip-confirm dialog when clicking Continue with 0 connections', async () => {
    render(
      <ChannelGrid initialConnections={{}} availability={ALL_READY} appBaseUrl="https://x" />
    );
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() =>
      expect(screen.getByText(/Continue without connecting anything/)).toBeInTheDocument()
    );
  });

  it('skips confirm and goes straight to /complete when >=1 connection', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });
    render(
      <ChannelGrid
        initialConnections={{ gmail: { count: 1, accounts: [{ email: 'a@x.com', name: null }] } }}
        availability={ALL_READY}
        appBaseUrl="https://x"
      />
    );
    fireEvent.click(screen.getByText('Continue'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/complete'));
  });

  it('shows success toast and refetches connections when returning from oauth', async () => {
    mockGet.mockImplementation((k: string) => (k === 'connected' ? 'gmail' : null));
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        byProvider: {
          gmail: [{ externalAccountId: 'new@example.com', displayName: 'New User' }],
        },
      }),
    });
    render(
      <ChannelGrid initialConnections={{}} availability={ALL_READY} appBaseUrl="https://x" />
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('gmail connected') })
    );
    expect(mockReplace).toHaveBeenCalledWith('/connect-channels');
    await waitFor(() => expect(screen.getByText('new@example.com')).toBeInTheDocument());
  });
});
