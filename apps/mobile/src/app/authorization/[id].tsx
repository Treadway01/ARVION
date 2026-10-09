import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SkeletonCard } from '../../components/Skeleton';
import { Chip } from '../../components/Chip';
import { useWallet } from '../../store/wallet';
import { useAuthorizations } from '../../store/authorizations';
import { useSkr } from '../../store/skr';
import { ActivityRow, AuthStatus, StoredAuthorization, api } from '../../services/api';
import { formatAmount } from '../../utils/amount';
import { Tone, labelFor, toneOf } from '../../utils/activity';
import { colors, font } from '../../theme/tokens';

const STATUS: Record<AuthStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'ok' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'purple' },
  PENDING_PAYMENT: { label: 'Payment required', tone: 'cyan' },
  EXPIRED: { label: 'Expired', tone: 'warn' },
  REVOKED: { label: 'Revoked', tone: 'danger' },
  DENIED: { label: 'Denied', tone: 'danger' },
  NOT_YET_VALID: { label: 'Not yet valid', tone: 'neutral' },
  INVALID: { label: 'Voided', tone: 'danger' },
};
const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;
const muted = { color: colors.textMuted, fontSize: 13 } as const;
const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-6)}`;

function span(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.round(h / 24)} days`;
}

export default function AuthorizationReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { address } = useWallet();
  const { approve, deny, revoke, pay } = useAuthorizations();
  const decimals = useSkr((s) => s.decimals);
  const loadSkr = useSkr((s) => s.load);
  const [a, setA] = useState<StoredAuthorization>();
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();

  const load = useCallback(async () => {
    const r = await api.getAuthorization(id);
    if (!r.ok) return setError(r.error.message);
    setA(r.value);
    setError(undefined);
    if (r.value.terms.price) loadSkr();
    if (address) {
      const ev = await api.activity(address);
      if (ev.ok) setEvents(ev.value.filter((e) => e.authorization_id === id).sort((x, y) => x.at - y.at));
    }
  }, [id, address, loadSkr]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!a)
    return (
      <Screen title="Authorization">
        {error ? (
          <GlassCard accent={colors.danger}>
            <Text style={{ color: colors.text, fontSize: 14 }}>{error}</Text>
            <PrimaryButton label="Retry" onPress={load} />
          </GlassCard>
        ) : <SkeletonCard />}
        <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );

  const t = a.terms;
  const s = STATUS[a.status];
  const isHolder = address === t.subject;
  const isIssuer = address === t.issuer;
  const price = t.price
    ? `${decimals !== undefined ? formatAmount(t.price.amount, decimals) : `${t.price.amount} units`} SKR`
    : undefined;
  const pending = a.status === 'PENDING_APPROVAL' || a.status === 'PENDING_PAYMENT';
  const revocable = isIssuer && (a.status === 'ACTIVE' || pending || a.status === 'NOT_YET_VALID');

  const act = async (okText: string, fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(undefined);
    useAuthorizations.setState({ error: undefined });
    await fn();
    const e = useAuthorizations.getState().error;
    setBusy(false);
    setConfirm(false);
    await load();
    setMsg(e ? { text: e.message, ok: false } : { text: okText, ok: true });
  };

  const doPay = async () => {
    setBusy(true);
    setMsg(undefined);
    await pay(a, address!);
    const ps = useAuthorizations.getState().payState;
    setBusy(false);
    await load();
    setMsg(ps?.step === 'done' ? { text: 'Payment confirmed. Authorization active.', ok: true }
      : { text: ps?.text ?? 'Payment was not completed.', ok: false });
  };

  return (
    <Screen title="Authorization">
      <GlassCard raised>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Chip label={t.resource.kind.toUpperCase()} />
          <Chip label={s.label} tone={s.tone} dot />
        </View>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 }}>{t.resource.name}</Text>

        <Text style={label}>WHO</Text>
        <Text style={muted}>
          Issued by <Text style={{ fontFamily: font.mono, color: colors.text }}>{short(t.issuer)}{isIssuer ? ' (you)' : ''}</Text>
        </Text>
        <Text style={muted}>
          Holder <Text style={{ fontFamily: font.mono, color: colors.text }}>{short(t.subject)}{isHolder ? ' (you)' : ''}</Text>
        </Text>

        <Text style={label}>PERMISSIONS</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {t.permissions.map((p) => <Chip key={p} label={`✓ ${p}`} tone="cyan" />)}
        </View>

        <Text style={label}>DURATION</Text>
        <Text style={muted}>
          {span(t.expiresAt - t.issuedAt)} · {a.status === 'EXPIRED' ? 'expired' : 'expires'} {new Date(t.expiresAt).toLocaleString()}
        </Text>
        {price && (<><Text style={label}>ACCESS PRICE</Text><Text style={muted}>{price}, paid by the holder to the issuer</Text></>)}
        <Text style={label}>REQUESTING SERVICE</Text>
        <Text style={muted}>Issued from this app's issuer tool by the wallet above</Text>
      </GlassCard>

      {busy && (
        <GlassCard accent={colors.cyan}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>Waiting for wallet</Text>
          <Text style={muted}>Approve the request in your wallet.</Text>
        </GlassCard>
      )}

      {msg && (
        <GlassCard accent={msg.ok ? colors.ok : colors.danger}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{msg.text}</Text>
        </GlassCard>
      )}

      {a.status === 'DENIED' && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Request denied</Text>
          <Text style={muted}>This authorization is not active and cannot be used.</Text>
        </GlassCard>
      )}
      {a.status === 'EXPIRED' && (
        <GlassCard accent={colors.warn}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Expired</Text>
          <Text style={muted}>This authorization expired on {new Date(t.expiresAt).toLocaleString()}. Access is refused.</Text>
        </GlassCard>
      )}
      {a.status === 'REVOKED' && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Revoked</Text>
          <Text style={muted}>The issuer revoked this authorization. Access is refused.</Text>
        </GlassCard>
      )}
      {a.status === 'INVALID' && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Voided</Text>
          <Text style={muted}>The issuer no longer owns this asset, or the record is invalid.</Text>
        </GlassCard>
      )}

      {(isHolder || isIssuer) && (
        <GlassCard raised>
          <Text style={label}>ACTIONS</Text>

          {isHolder && a.status === 'PENDING_APPROVAL' && !t.price && (
            <>
              <PrimaryButton label="Approve & sign" disabled={busy}
                onPress={() => act('Approved. The authorization is now active.', () => approve(a, address!))} />
              <PrimaryButton label="Deny request" variant="secondary" disabled={busy}
                onPress={() => act('Request denied.', () => deny(a, address!))} />
            </>
          )}

          {isHolder && !!t.price && pending && (
            <>
              <PrimaryButton label={busy ? 'Working...' : 'Pay & Request Access'} disabled={busy} onPress={doPay} />
              {a.status === 'PENDING_APPROVAL' && (
                <PrimaryButton label="Deny request" variant="secondary" disabled={busy}
                  onPress={() => act('Request denied.', () => deny(a, address!))} />
              )}
            </>
          )}

          {isHolder && a.status === 'ACTIVE' && (
            <PrimaryButton label="Use access" onPress={() => router.push('/access')} />
          )}

          {revocable && !confirm && (
            <PrimaryButton label="Revoke access" variant="secondary" disabled={busy} onPress={() => setConfirm(true)} />
          )}
          {revocable && confirm && (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.warn, fontSize: 14 }}>
                The holder will immediately lose access. This needs your wallet signature.
              </Text>
              <PrimaryButton label="Confirm revoke" disabled={busy}
                onPress={() => act('Authorization revoked.', () => revoke(a, address!))} />
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setConfirm(false)} />
            </View>
          )}

          {!(isHolder && (pending || a.status === 'ACTIVE')) && !revocable && (
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>No actions available for this state.</Text>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <Text style={label}>LIFECYCLE</Text>
        {events.length === 0 && <Text style={{ color: colors.textFaint, fontSize: 13 }}>No events yet.</Text>}
        {events.map((e) => (
          <View key={e.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: colors[toneOf(e.type) === 'neutral' ? 'textMuted' : toneOf(e.type) === 'ok' ? 'ok' : toneOf(e.type) === 'danger' ? 'danger' : toneOf(e.type) === 'warn' ? 'warn' : toneOf(e.type) === 'cyan' ? 'cyan' : 'purple'] }} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{labelFor(e.type)}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>{new Date(e.at).toLocaleString()}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
