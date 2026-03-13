import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommissionBalance {
  earnedCents: number;
  reservedCents: number;
  availableCents: number;
}

export interface PayoutRequest {
  id: string;
  referrer_id: string;
  amount_cents: number;
  status: string;
  stripe_transfer_id: string | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface PayoutRequestWithEmail extends PayoutRequest {
  email: string;
  stripe_connect_account_id: string | null;
}

/** Returns earned, reserved, and available balance in cents for a referrer */
export async function getBalance(
  supabase: SupabaseClient,
  userId: string,
): Promise<CommissionBalance> {
  const [allCommissions, matureCommissions, payoutsResult] = await Promise.all([
    supabase
      .from('referral_commissions')
      .select('amount_cents')
      .eq('referrer_id', userId),
    supabase
      .from('referral_commissions')
      .select('amount_cents')
      .eq('referrer_id', userId)
      .lte('created_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from('payout_requests')
      .select('amount_cents, status')
      .eq('referrer_id', userId)
      .in('status', ['pending_transfer', 'completed']),
  ]);

  const totalEarned = (allCommissions.data ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + row.amount_cents,
    0,
  );
  const maturedEarned = (matureCommissions.data ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + row.amount_cents,
    0,
  );

  const payouts = (payoutsResult.data ?? []) as { amount_cents: number; status: string }[];
  const reserved = payouts
    .filter((r) => r.status === 'pending_transfer')
    .reduce((sum, row) => sum + row.amount_cents, 0);
  const paidOut = payouts
    .filter((r) => r.status === 'completed')
    .reduce((sum, row) => sum + row.amount_cents, 0);

  return {
    earnedCents: totalEarned,
    reservedCents: reserved,
    availableCents: maturedEarned - reserved - paidOut,
  };
}

/** Returns payout history for a referrer, newest first */
export async function getPayoutHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<PayoutRequest[]> {
  const { data } = await supabase
    .from('payout_requests')
    .select('*')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });
  return (data ?? []) as PayoutRequest[];
}

/** Records a commission (idempotent via stripe_invoice_id UNIQUE constraint) */
export async function recordCommission(
  supabase: SupabaseClient,
  params: {
    referrerId: string;
    referredId: string;
    invoiceId: string;
    amountCents: number;
    ratePercent: number;
  },
): Promise<void> {
  const { error } = await supabase.from('referral_commissions').upsert(
    {
      referrer_id: params.referrerId,
      referred_id: params.referredId,
      stripe_invoice_id: params.invoiceId,
      amount_cents: params.amountCents,
      rate_percent: params.ratePercent,
    },
    { onConflict: 'stripe_invoice_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(`recordCommission failed: ${error.message}`);
}

/** Calls the atomic payout RPC. Throws on validation failure. */
export async function callAtomicPayout(
  supabase: SupabaseClient,
  userId: string,
  amountCents: number,
): Promise<PayoutRequest> {
  const { data, error } = await supabase.rpc('create_payout_atomic', {
    p_user_id: userId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(error.message);
  return data as PayoutRequest;
}

/** Lists all payout requests joined with email and connect account id */
export async function listPendingPayouts(
  supabase: SupabaseClient,
  statusFilter?: string,
): Promise<PayoutRequestWithEmail[]> {
  let query = supabase
    .from('payout_requests')
    .select('*, profiles!payout_requests_referrer_id_fkey(email, stripe_connect_account_id)')
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listPendingPayouts failed: ${error.message}`);

  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    email: row.profiles?.email ?? '',
    stripe_connect_account_id: row.profiles?.stripe_connect_account_id ?? null,
    profiles: undefined,
  }));
}

/** Marks a pending_transfer payout as completed with Stripe transfer ID */
export async function completePayoutRequest(
  supabase: SupabaseClient,
  id: string,
  stripeTransferId: string,
): Promise<void> {
  const { error } = await supabase
    .from('payout_requests')
    .update({
      status: 'completed',
      stripe_transfer_id: stripeTransferId,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`completePayoutRequest failed: ${error.message}`);
}

/** Marks a payout as failed so the reserved balance is released */
export async function failPayoutRequest(
  supabase: SupabaseClient,
  id: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase
    .from('payout_requests')
    .update({
      status: 'failed',
      admin_note: reason,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw new Error(`failPayoutRequest failed: ${error.message}`);
}
