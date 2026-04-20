import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '@/app/(auth)/register/page';

// Mock next-auth/react
const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

// Mock UI components
jest.mock('@/components/ui/separator', () => ({
  Separator: ({ className }: { className?: string }) => <hr className={className} />,
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the register form with InboxGPT branding', () => {
    render(<RegisterPage />);
    expect(screen.getByText('InboxGPT')).toBeInTheDocument();
    expect(screen.getByText('Create an account')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
  });

  it('renders the Google sign-up button', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
  });

  it('renders link to login page', () => {
    render(<RegisterPage />);
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'different456');
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('shows error when password is too short', async () => {
    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'short');
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('registers and auto-signs in on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, user: { id: '1', email: 'test@example.com' } }),
    });
    mockSignIn.mockResolvedValue({ error: null });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Test User');
    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@example.com', password: 'password123', name: 'Test User' }),
      });
    });

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      });
      expect(mockPush).toHaveBeenCalledWith('/inbox');
    });
  });

  it('shows server error on registration failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'User already exists' }),
    });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'existing@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    await waitFor(() => {
      expect(screen.getByText('User already exists')).toBeInTheDocument();
    });
  });

  it('shows message when registration succeeds but login fails', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    mockSignIn.mockResolvedValue({ error: 'some error' });

    render(<RegisterPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.type(screen.getByLabelText('Confirm Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /create account with email/i }));

    await waitFor(() => {
      expect(screen.getByText(/registration successful but login failed/i)).toBeInTheDocument();
    });
  });

  it('calls signIn("google") when Google button is clicked', () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign up with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/welcome' });
  });
});
