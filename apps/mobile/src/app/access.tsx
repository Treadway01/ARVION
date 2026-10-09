import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { SkeletonCard } from '../components/Skeleton';
import { LockIcon } from '../components/LockIcon';
import { Chip } from '../components/Chip';
import { StatTile } from '../components/StatTile';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { useAuthorizations } from '../store/authorizations';
import { useSkr } from '../store/skr';
import { formatAmount } from '../utils/amount';
import { colors, font, radius } from '../theme/tokens';
import { AuthStatus, StoredAuthorization } from '../services/api';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'purple' | 'cyan';
type Filter = 'all' | 'pending' | 'active' | 'history';
const STATUS: Record<AuthStatus, { label: string; tone: Tone; accent: string }> = {
  ACTIVE: { label: 'Active', tone: 'ok', accent: colors.ok },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'purple', accent: colors.purple },
  PENDING_PAYMENT: { label: 'Payment required', tone: 'cyan', accent: colors.cyan },
  EXPIRED: { label: 'Expired', tone: 'warn', accent: colors.warn },
  REVOKED: { label: 'Revoked', tone: 'danger', accent: colors.danger },
  DENIED: { label: 'Denied', tone: 'danger', accent: colors.danger },
  NOT_YET_VALID: { label: 'Not yet valid', tone: 'neutral', accent: colors.textFaint },
  INVALID: { label: 'Voided', tone: 'danger', accent: colors.danger },
};
const BUCKET: Record<AuthStatus, Exclude<Filter, 'all'>> = {
  ACTIVE: 'active', PENDING_APPROVAL: 'pending', PENDING_PAYMENT: 'pending', NOT_YET_VALID: 'pending',
  EXPIRED: 'history', REVOKED: 'history', DENIED: 'history', INVALID: 'history',
};
const cap = { color: colors.textMuted, fontSize: 12 } as const;
const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;
const CHECKS = ['Identity recognized', 'Authorization active', 'Permission valid', 'Credential not expired'];

export default function Access() {
  const router = useRouter();
  const { address, status } = useWallet();
  const { items, issued, loading, error, doorResult, refresh, refreshIssued, unlock } = useAuthorizations();
  const decimals = useSkr((s) => s.decimals);
  const loadSkr = useSkr((s) => s.load);
  const [tab, setTab] = useState<'to' | 'by'>('to');
  const [filter, setFilter] = useState<Filter>('all');
  const [using, setUsing] = useState<string>();

  useEffect(() => {
    if (!address) return;
    refresh(address);
    refreshIssued(address);
  }, [address, refresh, refreshIssued]);

  useEffect(() => {
    if ([...items, ...issued].some((a) => a.terms.price)) loadSkr();
  }, [items, issued, loadSkr]);

  if (status !== 'connected' || !address)
    return (
      <Screen title="Access">
        <EmptyState title="Connect your wallet" body="Connect on the Identity tab to see access issued to you and by you." />
      </Screen>
    );

  const base = tab === 'to' ? items : issued;
  const count = (f: Exclude<Filter, 'all'>) => base.filter((a) => BUCKET[a.status] === f).length;
  const list = base.filter((a) => filter === 'all' || BUCKET[a.status] === filter);
  const reload = () => { refresh(address); refreshIssued(address); };
  const price = (a: StoredAuthorization) =>
    a.terms.price
      ? `${decimals !== undefined ? formatAmount(a.terms.price.amount, decimals) : `${a.terms.price.amount} units`} SKR`
      : undefined;

  async function useAccess(a: StoredAuthorization) {
    setUsing(a.terms.id);
    await unlock(a, address!);
    setUsing(undefined);
  }

  function card(a: StoredAuthorization, i: number) {
    const s = STATUS[a.status];
    const p = price(a);
    const res = doorResult?.authId === a.terms.id ? doorResult : undefined;
    return (
      <FadeIn key={a.terms.id} delay={Math.min(i, 4) * 60}>
        <GlassCard raised accent={s.accent}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Chip label={a.terms.resource.kind.toUpperCase()} />
            <Chip label={s.label} tone={s.tone} dot />
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 }}>
            {a.terms.resource.name}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {a.terms.permissions.map((x) => <Chip key={x} label={x} tone="cyan" />)}
            {p && <Chip label={`Access price ${p}`} tone="purple" />}
          </View>
          <Text style={cap}>
            {tab === 'to' ? 'Issued by ' : 'Issued to '}
            <Text style={{ fontFamily: font.mono }}>
              {short(tab === 'to' ? a.terms.issuer : a.terms.subject)}
              {a.terms.issuer === a.terms.subject ? ' (you)' : ''}
            </Text>
            {' · '}Expires {new Date(a.terms.expiresAt).toLocaleString()}
          </Text>

          <PrimaryButton
            label={a.status === 'PENDING_PAYMENT' || (a.status === 'PENDING_APPROVAL' && a.terms.price) ? 'Review & pay'
              : a.status === 'PENDING_APPROVAL' && tab === 'to' ? 'Review request' : 'View details'}
            variant="secondary"
            onPress={() => router.push(`/authorization/${a.terms.id}`)}
          />

          {tab === 'to' && a.status === 'ACTIVE' && (
            <View
              style={{
                marginTop: 4, padding: 16, gap: 10, alignItems: 'center', borderWidth: 1,
                borderColor: colors.border, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.03)',
              }}>
              <Chip label="Demo physical controller" tone="warn" />
              <LockIcon unlocked={!!res?.granted} />
              <Text style={{ color: colors.textFaint, fontSize: 12, textAlign: 'center' }}>
                Simulated hardware. The result below comes from the real authorization check.
              </Text>
              <View style={{ alignSelf: 'stretch' }}>
                <PrimaryButton label={using === a.terms.id ? 'Checking access...' : 'Use access'}
                  disabled={using === a.terms.id} onPress={() => useAccess(a)} />
              </View>
              {res?.granted && (
                <View style={{ alignSelf: 'stretch', gap: 4 }}>
                  {CHECKS.map((c) => (
                    <Text key={c} style={{ color: colors.ok, fontSize: 13 }}>✓ {c}</Text>
                  ))}
                  <Text style={{ color: colors.ok, fontSize: 16, fontWeight: '700', marginTop: 4 }}>ACCESS GRANTED</Text>
                </View>
              )}
            </View>
          )}

          {res && !res.granted && (
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '700' }}>ACCESS DENIED</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{res.text}</Text>
            </View>
          )}
        </GlassCard>
      </FadeIn>
    );
  }

  const chip = (f: Filter, label: string) => (
    <Pressable key={f} accessibilityRole="button" onPress={() => setFilter(f)}>
      <Chip label={label} tone={filter === f ? 'purple' : 'neutral'} dot={filter === f} />
    </Pressable>
  );

  return (
    <Screen title="Access">
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setTab('to')}>
          <Chip label={`To me (${items.length})`} tone={tab === 'to' ? 'purple' : 'neutral'} dot={tab === 'to'} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setTab('by')}>
          <Chip label={`By me (${issued.length})`} tone={tab === 'by' ? 'purple' : 'neutral'} dot={tab === 'by'} />
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <StatTile label="PENDING" value={count('pending')} />
        <StatTile label="ACTIVE" value={count('active')} />
        <StatTile label="HISTORY" value={count('history')} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {chip('all', 'All')}{chip('pending', 'Pending')}{chip('active', 'Active')}{chip('history', 'History')}
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PrimaryButton label="Issue" onPress={() => router.push('/issue')} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton label={loading ? 'Loading...' : 'Refresh'} variant="secondary" disabled={loading} onPress={reload} />
        </View>
      </View>

      {error && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{error.message}</Text>
          <PrimaryButton label="Retry" onPress={reload} />
        </GlassCard>
      )}

      {loading && base.length === 0 && (<><SkeletonCard /><SkeletonCard /></>)}

      {list.length === 0 && !loading && !error && (
        tab === 'to' ? (
          <GlassCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
              {filter === 'all' ? 'No access issued to you' : 'Nothing in this view'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Ask an issuer to send you one, or issue one to yourself. Your own assets never need payment.
            </Text>
            <PrimaryButton label="Issue to myself" onPress={() => router.push({ pathname: '/issue', params: { self: '1' } })} />
          </GlassCard>
        ) : (
          <GlassCard>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
              {filter === 'all' ? "You haven't issued any access" : 'Nothing in this view'}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Give another wallet time-limited access, free or for a price in SKR. You can revoke it at any time.
            </Text>
            <PrimaryButton label="Issue access" onPress={() => router.push('/issue')} />
          </GlassCard>
        )
      )}

      {list.map(card)}
    </Screen>
  );
}
