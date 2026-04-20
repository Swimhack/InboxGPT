import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/app/(auth)/login/page';

// Mock next-auth/react
const mockSignIn = jest.fn();
jest.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Mock next/navigation
const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
  useSearchParams: () => ({ get: mockGet }),
}));

// Mock UI components as simple pass-throughs
jest.mock('@/components/ui/separator', () => ({
  Separator: ({ className }: { className?: string }) => <hr className={className} />,
}));

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockReturnValue(null);
  });

  it('renders the login form with InboxGPT branding', () => {
    render(<LoginPage />);
    expect(screen.getByText('InboxGPT')).toBeInTheDocument();
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('renders the Google sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });

  it('renders the email sign-in button', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: /sign in with email/i })).toBeInTheDocument();
  });

  it('renders link to register page', () => {
    render(<LoginPage />);
    const link = screen.getByRole('link', { name: /sign up/i });
    expect(link).toHaveAttribute('href', '/register');
  });

  it('shows OAuthAccountNotLinked error from search params', () => {
    mockGet.mockReturnValue('OAuthAccountNotLinked');
    render(<LoginPage />);
    expect(screen.getByText(/already registered with a different sign-in method/i)).toBeInTheDocument();
  });

  it('submits credentials and redirects on success', async () => {
    mockSignIn.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('credentials', {
        email: 'test@example.com',
        password: 'password123',
        redirect: false,
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/inbox');
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it('shows error on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'bad@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpass');
    fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('shows generic error on network failure', async () => {
    mockSignIn.mockRejectedValueOnce(new Error('Network error'));
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

    await waitFor(() => {
      expect(screen.getByText('An error occurred. Please try again.')).toBeInTheDocument();
    });
  });

  it('calls signIn("google") when Google button is clicked', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign in with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith('google', { callbackUrl: '/welcome' });
  });

  it('disables buttons while loading', async () => {
    mockSignIn.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<LoginPage />);

    await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    fireEvent.click(screen.getByRole('button', { name: /sign in with email/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
