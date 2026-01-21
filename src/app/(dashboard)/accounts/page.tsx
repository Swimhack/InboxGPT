import { requireAuth } from '@/lib/auth/session';
import { AccountList } from '@/components/accounts/account-list';

export default async function AccountsPage() {
  await requireAuth();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Email Accounts</h1>
      <AccountList />
    </div>
  );
}
