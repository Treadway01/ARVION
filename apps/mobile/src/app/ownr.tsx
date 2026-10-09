import { useCallback, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { SkeletonCard } from '../components/Skeleton';
import { StatTile } from '../components/StatTile';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { useAuthorizations } from '../store/authorizations';
import { AssetView, Ownership, api, assetPhotoUrl } from '../services/api';
import { colors, radius } from '../theme/tokens';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'purple' | 'cyan';
export const OWNERSHIP: Record<Ownership, { label: string; tone: Tone }> = {
  USER_DECLARED: { label: 'User declared', tone: 'warn' },
  ON_CHAIN_VERIFIED: { label: 'On-chain verified', tone: 'ok' },
  TRANSFERRED: { label: 'Transferred', tone: 'purple' },
  UNKNOWN: { label: 'Unknown', tone: 'neutral' },
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Ownr() {
  const router = useRouter();
  const { address, status } = useWallet();
  const { items } = useAuthorizations();
  const [assets, setAssets] = useState<AssetView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(undefined);
    const r = await api.listAssetRecords(address);
    if (r.ok) setAssets(r.value);
    else setError(r.error.message);
    setLoading(false);
    setLoaded(true);
  }, [address]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (status !== 'connected' || !address)
    return (
      <Screen title="OWNR">
        <EmptyState title="Connect your wallet" body="Connect on the Identity tab to create and manage assets." />
      </Screen>
    );

  const shared = items.filter((i) => i.terms.resource.kind === 'asset' && i.status === 'ACTIVE');
  const onChain = assets.filter((a) => a.ownership === 'ON_CHAIN_VERIFIED').length;

  return (
    <Screen title="OWNR">
      <FadeIn>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <StatTile label="ASSETS" value={assets.length} loading={!loaded} />
          <StatTile label="ON-CHAIN" value={onChain} loading={!loaded} />
          <StatTile label="SHARED WITH ME" value={shared.length} />
        </View>
      </FadeIn>

      <PrimaryButton label="+ Create asset" onPress={() => router.push('/create-asset')} />

      {error && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{error}</Text>
          <PrimaryButton label="Retry" onPress={load} />
        </GlassCard>
      )}

      {!loaded && loading && (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {loaded && !error && assets.length === 0 && (
        <GlassCard>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>No assets yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            An asset is a record of something you own, such as equipment, a vehicle, a membership or a certificate.
            Photograph it, describe it and sign it with your wallet. You can anchor it on Solana to transfer it later.
          </Text>
          <PrimaryButton label="Create your first asset" onPress={() => router.push('/create-asset')} />
        </GlassCard>
      )}

      {assets.map((a, i) => {
        const o = OWNERSHIP[a.ownership];
        return (
          <FadeIn key={a.id} delay={Math.min(i, 4) * 60}>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/asset/${a.id}`)}>
              <GlassCard raised>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
                  <Image
                    source={{ uri: assetPhotoUrl(a.id) }}
                    style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.surface }}
                  />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      <Chip label={cap(a.category)} />
                      <Chip label={o.label} tone={o.tone} dot />
                    </View>
                  </View>
                </View>
              </GlassCard>
            </Pressable>
          </FadeIn>
        );
      })}

      {shared.length > 0 && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>
            SHARED WITH YOU
          </Text>
          {shared.map((s) => (
            <GlassCard key={s.terms.id} accent={colors.cyan}>
              <Chip label="Authorized" tone="cyan" dot />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>{s.terms.resource.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {s.terms.permissions.join(', ')} until {new Date(s.terms.expiresAt).toLocaleString()}
              </Text>
            </GlassCard>
          ))}
        </>
      )}
    </Screen>
  );
}