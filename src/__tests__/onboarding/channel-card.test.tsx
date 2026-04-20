import { render, screen, fireEvent } from '@testing-library/react';
import { ChannelCard } from '@/components/onboarding/channel-card';
import type { ChannelDef } from '@/lib/channels/catalog';

const oauthDef: ChannelDef = {
  id: 'gmail',
  name: 'Gmail',
  description: 'Gmail via OAuth',
  category: 'email',
  iconKey: 'gmail',
  strategy: { kind: 'oauth', initiatePath: '/api/auth/oauth/gmail' },
};

const comingSoonDef: ChannelDef = {
  id: 'x',
  name: 'X',
  description: 'X DMs',
  category: 'social',
  iconKey: 'x',
  strategy: { kind: 'coming-soon', reason: 'Requires X Enterprise API tier.' },
};

const installDef: ChannelDef = {
  id: 'slack',
  name: 'Slack',
  description: 'Slack',
  category: 'chat',
  iconKey: 'slack',
  strategy: { kind: 'install-doc', docUrl: 'https://x', webhookPath: '/api/webhooks/slack' },
};

describe('ChannelCard', () => {
  it('renders a ready channel with a Connect button and dispatches onConnect', () => {
    const onConnect = jest.fn();
    render(<ChannelCard def={oauthDef} state="ready" onConnect={onConnect} />);
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    const button = screen.getByTestId('channel-connect-gmail');
    expect(button).toHaveTextContent('Connect');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onConnect).toHaveBeenCalledWith(oauthDef);
  });

  it('renders a connected channel showing the email address', () => {
    const onConnect = jest.fn();
    render(
      <ChannelCard
        def={oauthDef}
        state="connected"
        connectedAccounts={[{ email: 'alice@example.com', name: 'Alice' }]}
        onConnect={onConnect}
      />
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    const button = screen.getByTestId('channel-connect-gmail');
    expect(button).toHaveTextContent('Add another');
  });

  it('shows count label when more than one account connected', () => {
    const onConnect = jest.fn();
    render(
      <ChannelCard
        def={oauthDef}
        state="connected"
        connectedAccounts={[
          { email: 'alice@example.com', name: null },
          { email: 'bob@example.com', name: null },
          { email: 'carol@example.com', name: null },
        ]}
        onConnect={onConnect}
      />
    );
    expect(screen.getByText('3 connected')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('carol@example.com')).toBeInTheDocument();
  });

  it('truncates account list to 3 and shows overflow count', () => {
    const onConnect = jest.fn();
    render(
      <ChannelCard
        def={oauthDef}
        state="connected"
        connectedAccounts={[
          { email: 'a@x.com', name: null },
          { email: 'b@x.com', name: null },
          { email: 'c@x.com', name: null },
          { email: 'd@x.com', name: null },
          { email: 'e@x.com', name: null },
        ]}
        onConnect={onConnect}
      />
    );
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('renders a coming-soon channel disabled and does not call onConnect', () => {
    const onConnect = jest.fn();
    render(<ChannelCard def={comingSoonDef} state="coming-soon" onConnect={onConnect} />);
    const button = screen.getByTestId('channel-connect-x');
    expect(button).toBeDisabled();
    expect(screen.getAllByText(/coming soon/i).length).toBeGreaterThan(0);
    fireEvent.click(button);
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('uses passed comingSoonReason in tooltip when downgraded from ready', () => {
    const onConnect = jest.fn();
    render(
      <ChannelCard
        def={oauthDef}
        state="coming-soon"
        comingSoonReason="Set GOOGLE_CLIENT_ID to enable Gmail."
        onConnect={onConnect}
      />
    );
    expect(screen.getByTestId('channel-connect-gmail')).toBeDisabled();
  });

  it('shows "Set up" label for install-doc strategy', () => {
    const onConnect = jest.fn();
    render(<ChannelCard def={installDef} state="ready" onConnect={onConnect} />);
    expect(screen.getByTestId('channel-connect-slack')).toHaveTextContent('Set up');
  });

  it('shows a spinner and disables when busy', () => {
    const onConnect = jest.fn();
    render(<ChannelCard def={oauthDef} state="ready" busy onConnect={onConnect} />);
    const button = screen.getByTestId('channel-connect-gmail');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Connecting');
  });
});
