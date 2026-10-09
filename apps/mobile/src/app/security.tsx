import { useCallback, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { useIdentity } from '../store/identity';
import { useAuthorizations } from '../store/authorizations';
import { ActivityRow, api } from '../services/api';
import { SECURITY_TYPES, Tone, labelFor, timeAgo } from '../utils/activity';
import { env } from '../config/env';
import { colors } from '../theme/tokens';

type Level = 'ok' | 'attention' | 'unavailable' | 'info';
type Item = { key: string; title: string; level: Level; body: string; action?: { label: string; onPress: () => void } };
const LEVEL: Record<Level, { label: string; tone: Tone }> = {
  ok: { label: 'OK', tone: 'ok' },
  attention: { label: 'Needs attention', tone: 'warn' },
  unavailable: { label: 'Unavailable', tone: 'danger' },
  info: { label: 'Info', tone: 'neutral' },
};
type Net = { api: 'checking' | 'ok' | 'down'; rpc: 'checking' | 'ok' | 'down' | 'unconfigured' };
const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;
const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;
const DAY = 86_400_000;

async function rpcHealth(url: string): Promise<'ok' | 'down'> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
    });
    const j = (await res.json()) as { result?: string };
    return j.result === 'ok' ? 'ok' : 'down';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export default function Security() {
  const router = useRouter();
  const { address, status, error: walletError, connect, disconnect } = useWallet();
  const { items, issued, paidSigs, refresh, refreshIssued } = useAuthorizations();
  const sgt = useIdentity((s) => s.sgt);
  const loadIdentity = useIdentity((s) => s.load);
  const [events, setEvents] = useState<ActivityRow[]>([]);
  const [net, setNet] = useState<Net>({ api: 'checking', rpc: 'checking' });

  const checkNet = useCallback(async () => {
    setNet({ api: 'checking', rpc: 'checking' });
    const [h, rpc] = await Promise.all([
      api.health(),
      env.solanaRpcUrl ? rpcHealth(env.solanaRpcUrl) : Promise.resolve('unconfigured' as const),
    ]);
    setNet({ api: h.ok ? 'ok' : 'down', rpc });
  }, []);

  const load = useCallback(async () => {
    checkNet();
    if (!address) return;
    refresh(address);
    refreshIssued(address);
    loadIdentity(address);
    const r = await api.activity(address);
    if (r.ok) setEvents(r.value);
  }, [address, checkNet, refresh, refreshIssued, loadIdentity]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const now = Date.now();
  const connected = status === 'connected' && !!address;
  const all = [...items, ...issued.filter((i) => !items.some((x) => x.terms.id === i.terms.id))];
  const expiring = all.filter((a) => a.status === 'ACTIVE' && a.terms.expiresAt - now < DAY);
  const waiting = items.filter((a) => a.status === 'PENDING_APPROVAL' || a.status === 'PENDING_PAYMENT');
  const ended = all.filter((a) => ['EXPIRED', 'REVOKED', 'DENIED'].includes(a.status));
  const activeCount = all.filter((a) => a.status === 'ACTIVE').length;
  const denials = events.filter((e) => e.type === 'ACCESS_DENIED' && now - e.at < DAY);
  const unverifiedPay = Object.keys(paidSigs).filter((id) => {
    const a = items.find((i) => i.terms.id === id);
    return a && a.status !== 'ACTIVE';
  });
  const model = (Platform.constants as unknown as { Model?: string }).Model;
  const review = (id: string) => router.push(`/authorization/${id}`);

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'WALLET',
      items: [connected
        ? { key: 'w', title: 'Wallet connected', level: 'ok', body: `Connected through Mobile Wallet Adapter as ${short(address!)}. The app never sees your keys.`, action: { label: 'Disconnect', onPress: disconnect } }
        : { key: 'w', title: status === 'error' ? 'Wallet connection failed' : 'Wallet not connected', level: 'attention',
            body: walletError?.message ?? 'Connect a wallet to use identity, access and assets.',
            action: { label: status === 'error' ? 'Reconnect' : 'Connect wallet', onPress: connect } }],
    },
    {
      title: 'IDENTITY',
      items: [
        sgt.state === 'found'
          ? { key: 'i', title: 'Seeker Genesis Token found', level: 'ok', body: 'Read from Solana mainnet. Wallet-ownership signing (SIWS) is not implemented yet.' }
          : sgt.state === 'none'
          ? { key: 'i', title: 'No Seeker Genesis Token', level: 'info', body: 'This wallet holds none. Access and OWNR still work; the Seeker badge stays off.' }
          : sgt.state === 'error'
          ? { key: 'i', title: 'Seeker check unavailable', level: 'unavailable', body: 'Identity information could not be read from Solana mainnet.',
              action: { label: 'Retry', onPress: () => { if (address) { useIdentity.setState({ address: undefined }); loadIdentity(address); } } } }
          : { key: 'i', title: connected ? 'Checking Seeker identity...' : 'Identity not loaded', level: 'info', body: connected ? 'Reading from Solana mainnet.' : 'Connect a wallet first.' },
      ],
    },
    {
      title: 'AUTHORIZATIONS',
      items: [
        expiring.length > 0
          ? { key: 'a1', title: `${expiring.length} expiring within 24 hours`, level: 'attention', body: `${expiring[0].terms.resource.name} expires ${new Date(expiring[0].terms.expiresAt).toLocaleString()}.`, action: { label: 'Review', onPress: () => review(expiring[0].terms.id) } }
          : { key: 'a1', title: `${activeCount} active`, level: 'ok', body: activeCount ? 'No active credential expires within 24 hours.' : 'No active authorizations.' },
        ...(waiting.length > 0
          ? [{ key: 'a2', title: `${waiting.length} waiting for your decision`, level: 'attention' as Level, body: 'Review and approve or deny.', action: { label: 'Review', onPress: () => review(waiting[0].terms.id) } }]
          : []),
        ...(ended.length > 0
          ? [{ key: 'a3', title: `${ended.length} ended`, level: 'info' as Level, body: 'Expired, revoked or denied.', action: { label: 'View access', onPress: () => router.push('/access') } }]
          : []),
      ],
    },
    {
      title: 'ACCESS',
      items: [denials.length > 0
        ? { key: 'x', title: `${denials.length} access denial${denials.length === 1 ? '' : 's'} in the last 24 hours`, level: 'attention', body: 'Someone tried to use a credential that was not valid.', action: { label: 'View activity', onPress: () => router.push('/activity') } }
        : { key: 'x', title: 'No recent access denials', level: 'ok', body: 'Based on the activity recorded for this wallet.' }],
    },
    {
      title: 'NETWORK',
      items: [
        net.api === 'checking' || net.rpc === 'checking'
          ? { key: 'n', title: 'Checking connections...', level: 'info', body: 'Testing the API and Solana.' }
          : { key: 'n', title: net.api === 'ok' && net.rpc !== 'down' ? 'Services reachable' : 'Connection problem',
              level: net.api === 'ok' && net.rpc !== 'down' ? 'ok' : 'unavailable',
              body: `API: ${net.api === 'ok' ? 'reachable' : 'unreachable'}. Solana RPC: ${net.rpc === 'ok' ? 'reachable' : net.rpc === 'unconfigured' ? 'not configured' : 'unreachable'}.`,
              action: net.api === 'ok' && net.rpc === 'ok' ? undefined : { label: 'Retry', onPress: checkNet } },
      ],
    },
    {
      title: 'TRANSACTIONS',
      items: [unverifiedPay.length > 0
        ? { key: 't', title: 'Payment sent, not yet verified', level: 'attention', body: 'Your SKR payment was sent but the server has not confirmed it.', action: { label: 'Review', onPress: () => review(unverifiedPay[0]) } }
        : { key: 't', title: 'No pending transactions', level: 'ok', body: 'Nothing is waiting for confirmation.' }],
    },
    {
      title: 'DEVICE',
      items: [
        { key: 'd1', title: model ? `Device: ${model}` : 'Device model unavailable', level: 'info', body: 'Reported by Android. This alone does not prove a Seeker.' },
        { key: 'd2', title: 'Seed Vault status unavailable', level: 'unavailable', body: 'No supported API for this is used, so the app makes no claim about it.' },
      ],
    },
  ];

  const attention = sections.flatMap((s) => s.items).filter((i) => i.level === 'attention' || i.level === 'unavailable').length;
  const recent = events.filter((e) => SECURITY_TYPES.includes(e.type)).slice(0, 5);

  return (
    <Screen title="Security">
      <FadeIn>
        <GlassCard raised accent={attention > 0 ? colors.warn : colors.cyan}>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>
            {attention > 0 ? `${attention} item${attention === 1 ? '' : 's'} need attention` : 'Nothing needs attention right now'}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Based on this app's current state. It is not a security audit.
          </Text>
          <PrimaryButton label="Refresh" variant="secondary" onPress={load} />
        </GlassCard>
      </FadeIn>

      {sections.map((sec) => (
        <FadeIn key={sec.title}>
          <GlassCard>
            <Text style={label}>{sec.title}</Text>
            {sec.items.map((it) => (
              <View key={it.key} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                <Chip label={LEVEL[it.level].label} tone={LEVEL[it.level].tone} dot />
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{it.title}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{it.body}</Text>
                {it.action && <PrimaryButton label={it.action.label} variant="secondary" onPress={it.action.onPress} />}
              </View>
            ))}
          </GlassCard>
        </FadeIn>
      ))}

      <GlassCard>
        <Text style={label}>RECENT SECURITY EVENTS</Text>
        {recent.length === 0 && <Text style={{ color: colors.textFaint, fontSize: 13 }}>None recorded.</Text>}
        {recent.map((e) => (
          <View key={e.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{labelFor(e.type)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{timeAgo(e.at)}{e.detail ? ` · ${e.detail}` : ''}</Text>
          </View>
        ))}
        <PrimaryButton label="Open activity" variant="secondary" onPress={() => router.push('/activity')} />
      </GlassCard>
    </Screen>
  );
}
