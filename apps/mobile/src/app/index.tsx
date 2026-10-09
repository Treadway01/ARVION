import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { Chip } from '../components/Chip';
import { StatTile } from '../components/StatTile';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { useAuthorizations } from '../store/authorizations';
import { useIdentity } from '../store/identity';
import { listAssets } from '../providers/ownership/spl';
import { ActivityRow, api } from '../services/api';
import { labelFor, timeAgo } from '../utils/activity';
import { brand } from '../config/brand';
import { env } from '../config/env';
import { colors, font } from '../theme/tokens';

const dotColor = (type: string) =>
  type === 'ACCESS_GRANTED' ? colors.ok
  : type === 'ACCESS_DENIED' ? colors.danger
  : type === 'AUTHORIZATION_REVOKED' ? colors.warn
  : colors.purple;

export default function Home() {
  const router = useRouter();
  const { address, status, error, connect } = useWallet();
  const { items, loading, refresh } = useAuthorizations();
  const sgt = useIdentity((s) => s.sgt);
  const skr = useIdentity((s) => s.skr);
  const loadIdentity = useIdentity((s) => s.load);
  const [assets, setAssets] = useState<number | null | undefined>(undefined);
  const [recent, setRecent] = useState<ActivityRow[]>([]);
  const [banner, setBanner] = useState(false);
  const prevPending = useRef<number | null>(null);

  const pending = items.filter((i) => i.status === 'PENDING_APPROVAL' || i.status === 'PENDING_PAYMENT').length;
  const active = items.filter((i) => i.status === 'ACTIVE').length;
  const network = env.solanaCluster === 'mainnet-beta' ? 'Mainnet' : 'Devnet';

  useEffect(() => {
    if (!address) return;
    loadIdentity(address);
    (async () => {
      await refresh(address);
      const a = await api.listAssetRecords(address);
      setAssets(a.ok ? a.value.length : null);
      const act = await api.activity(address);
      if (act.ok) setRecent(act.value.slice(0, 5));
    })();
    const id = setInterval(() => refresh(address), 30_000);
    return () => clearInterval(id);
  }, [address, refresh, loadIdentity]);

  useEffect(() => {
    if (prevPending.current !== null && pending > prevPending.current) setBanner(true);
    prevPending.current = pending;
  }, [pending]);

  if (status !== 'connected' || !address)
    return (
      <Screen title="Home">
        <EmptyState title="Connect your wallet" body="Connect a wallet to see approvals, access and assets." />
        {error && <Text style={{ color: colors.danger }}>{error.message}</Text>}
        <PrimaryButton
          label={status === 'connecting' ? 'Connecting...' : 'Connect wallet'}
          disabled={status === 'connecting'}
          onPress={connect}
        />
      </Screen>
    );

  const firstLoad = loading && items.length === 0;
  const short = `${address.slice(0, 6)}...${address.slice(-6)}`;
  const seekerChip =
    sgt.state === 'found' ? <Chip label="Seeker verified" tone="ok" dot />
    : sgt.state === 'none' ? <Chip label="No Seeker token" />
    : sgt.state === 'error' ? <Chip label="Seeker check unavailable" tone="warn" />
    : <Chip label="Checking Seeker..." />;

  return (
    <Screen title="Home">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 3 }}>
          {brand.appName.toUpperCase()}
        </Text>
        <Chip label={network} tone="cyan" />
      </View>

      {banner && (
        <GlassCard raised accent={colors.purple}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>New authorization request</Text>
          <PrimaryButton label="Review" onPress={() => { setBanner(false); router.push('/access'); }} />
          <PrimaryButton label="Dismiss" variant="secondary" onPress={() => setBanner(false)} />
        </GlassCard>
      )}

      <FadeIn>
        <GlassCard raised>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
            TRUSTED DEVICE
          </Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 }}>
            {skr.state === 'found' && skr.value ? skr.value : 'Your wallet'}
          </Text>
          <Text selectable style={{ color: colors.textMuted, fontSize: 13, fontFamily: font.mono }}>{short}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            <Chip label="Wallet connected" tone="ok" dot />
            {seekerChip}
          </View>
        </GlassCard>
      </FadeIn>

      {pending > 0 && (
        <FadeIn delay={60}>
          <GlassCard raised accent={colors.purple}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>
              {pending} {pending === 1 ? 'request' : 'requests'} waiting for you
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>Approve with your wallet to activate access.</Text>
            <PrimaryButton label="Review" onPress={() => router.push('/access')} />
          </GlassCard>
        </FadeIn>
      )}

      <FadeIn delay={100}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile label="PENDING" value={pending} loading={firstLoad} />
          <StatTile label="ACTIVE" value={active} loading={firstLoad} />
          <StatTile
            label="ASSETS"
            value={typeof assets === 'number' ? assets : 'â€”'}
            caption={assets === null ? 'unavailable' : undefined}
            loading={assets === undefined}
          />
        </View>
      </FadeIn>

      <FadeIn delay={140}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Access" onPress={() => router.push('/access')} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="OWNR" variant="secondary" onPress={() => router.push('/ownr')} />
          </View>
          <View style={{ flex: 1 }}>
            <PrimaryButton label="Security" variant="secondary" onPress={() => router.push('/security')} />
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={180}>
        <GlassCard>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
            RECENT ACTIVITY
          </Text>
          {recent.length === 0 && (
            <Text style={{ color: colors.textFaint, fontSize: 13 }}>
              Nothing yet. Events involving your wallet appear here.
            </Text>
          )}
          <View style={{ marginTop: 6 }}>
            {recent.map((r, i) => (
              <View key={r.id} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center', width: 10 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor(r.type), marginTop: 4 }} />
                  {i < recent.length - 1 && (
                    <View style={{ flex: 1, width: 1, backgroundColor: colors.border, marginTop: 4 }} />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: 14 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{labelFor(r.type)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    {r.resource_id ? `${r.resource_id.slice(0, 18)} Â· ` : ''}{timeAgo(r.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
          <PrimaryButton label="View all activity" variant="secondary" onPress={() => router.push('/activity')} />
        </GlassCard>
      </FadeIn>
    </Screen>
  );
}