import { useCallback, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../components/Screen';
import { GlassCard } from '../../components/GlassCard';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SkeletonCard } from '../../components/Skeleton';
import { Chip } from '../../components/Chip';
import { Field } from '../../components/Field';
import { useWallet } from '../../store/wallet';
import { useAuthorizations } from '../../store/authorizations';
import { AssetDetail, AuthStatus, api, assetPhotoUrl } from '../../services/api';
import { anchorExisting, transferAndSync } from '../../providers/assets/records';
import { explorerTx } from '../../services/solana';
import { env } from '../../config/env';
import { labelFor, timeAgo } from '../../utils/activity';
import { OWNERSHIP } from '../ownr';
import { colors, font, radius } from '../../theme/tokens';

type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'purple' | 'cyan';
const AUTH: Record<AuthStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'ok' },
  PENDING_APPROVAL: { label: 'Awaiting approval', tone: 'purple' },
  PENDING_PAYMENT: { label: 'Payment required', tone: 'cyan' },
  EXPIRED: { label: 'Expired', tone: 'warn' },
  REVOKED: { label: 'Revoked', tone: 'danger' },
  NOT_YET_VALID: { label: 'Not yet valid', tone: 'neutral' },
  INVALID: { label: 'Voided', tone: 'danger' },
  DENIED: { label: 'Denied', tone: 'danger' },
};
const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;
const muted = { color: colors.textMuted, fontSize: 13 } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-6)}`;

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { address } = useWallet();
  const { revoke } = useAuthorizations();
  const [d, setD] = useState<AssetDetail>();
  const [error, setError] = useState<string>();
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    const r = await api.getAssetDetail(id);
    if (r.ok) { setD(r.value); setError(undefined); } else setError(r.error.message);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!d)
    return (
      <Screen title="Asset">
        {error ? (
          <GlassCard accent={colors.danger}>
            <Text style={{ color: colors.text, fontSize: 14 }}>{error}</Text>
            <PrimaryButton label="Retry" onPress={load} />
          </GlassCard>
        ) : (
          <SkeletonCard />
        )}
        <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );

  const a = d.asset;
  const o = OWNERSHIP[a.ownership];
  const isOwner = a.owner === address;
  const cluster = env.solanaCluster === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
  const run = async (fn: () => Promise<{ text: string; ok: boolean }>) => {
    setBusy(true);
    setMsg(undefined);
    setMsg(await fn());
    setBusy(false);
    load();
  };

  const anchor = () => run(async () => {
    const r = await anchorExisting(a.id);
    return r.ok ? { text: 'Anchored on Solana. This asset is now on-chain verified.', ok: true } : { text: r.error.message, ok: false };
  });
  const transfer = () => run(async () => {
    if (!a.mint) return { text: 'Anchor this asset on Solana first.', ok: false };
    const r = await transferAndSync(a.id, a.mint, to);
    return r.ok ? { text: 'Ownership transferred on Solana.', ok: true } : { text: r.error.message, ok: false };
  });
  const sync = () => run(async () => {
    const r = await api.syncAsset(a.id);
    return r.ok ? { text: r.value.changed ? 'Record updated from the chain.' : 'Already up to date.', ok: true } : { text: r.error.message, ok: false };
  });

  const details = [
    ['Description', a.meta.description], ['Serial', a.meta.serial], ['Manufacturer', a.meta.manufacturer],
    ['Model', a.meta.model], ['Reference', a.meta.reference],
  ].filter(([, v]) => !!v);

  return (
    <Screen title={a.name}>
      <GlassCard raised>
        <Image source={{ uri: assetPhotoUrl(a.id) }}
          style={{ width: '100%', height: 240, borderRadius: radius.lg, backgroundColor: colors.surface }} resizeMode="cover" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip label={cap(a.category)} />
          <Chip label={o.label} tone={o.tone} dot />
          {a.mint && <Chip label={cluster === 'devnet' ? 'Solana devnet' : 'Solana'} tone="cyan" />}
        </View>
        <Text style={muted}>
          {a.ownership === 'USER_DECLARED' && 'Declared by the owner and signed with their wallet. Not verified on-chain.'}
          {a.ownership === 'ON_CHAIN_VERIFIED' && 'The token for this asset is held by the owner wallet on Solana.'}
          {a.ownership === 'TRANSFERRED' && `The token is now held by ${a.holder ? short(a.holder) : 'another wallet'}. Sync to update this record.`}
          {a.ownership === 'UNKNOWN' && 'Could not read the chain right now. Try again shortly.'}
        </Text>
        <Text style={muted}>
          Owner <Text style={{ fontFamily: font.mono }}>{short(a.owner)}{isOwner ? ' (you)' : ''}</Text>
        </Text>
        <Text style={muted}>Created {new Date(a.createdAt).toLocaleDateString()}</Text>
        <Text selectable style={{ color: colors.textFaint, fontSize: 11, fontFamily: font.mono }}>Asset ID {a.id}</Text>
        {a.mint && (
          <Text style={{ color: colors.cyan, fontSize: 13 }}
            onPress={() => Linking.openURL(`https://explorer.solana.com/address/${a.mint}?cluster=${cluster}`)}>
            View on-chain record
          </Text>
        )}
      </GlassCard>

      {msg && (
        <GlassCard accent={msg.ok ? colors.ok : colors.danger}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{msg.text}</Text>
        </GlassCard>
      )}

      {details.length > 0 && (
        <GlassCard>
          <Text style={label}>DETAILS</Text>
          {details.map(([k, v]) => (
            <Text key={k} style={muted}><Text style={{ color: colors.text }}>{k}: </Text>{v}</Text>
          ))}
        </GlassCard>
      )}

      {a.ownership === 'TRANSFERRED' && <PrimaryButton label={busy ? 'Working...' : 'Sync with chain'} disabled={busy} onPress={sync} />}

      {isOwner && a.ownership !== 'TRANSFERRED' && (
        <GlassCard raised>
          <Text style={label}>ACTIONS</Text>
          <PrimaryButton label="Authorize another wallet"
            onPress={() => router.push({ pathname: '/issue', params: { resourceId: a.id, resourceName: a.name, kind: 'asset' } })} />
          {a.mint ? (
            <>
              <Field placeholder="New owner wallet address" autoCapitalize="none" autoCorrect={false} value={to} onChangeText={setTo} />
              <PrimaryButton label={busy ? 'Waiting for wallet...' : 'Transfer ownership'} variant="secondary"
                disabled={busy || !to.trim()} onPress={transfer} />
            </>
          ) : (
            <>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                Transfer needs an on-chain token. Anchor this asset on Solana first.
              </Text>
              <PrimaryButton label={busy ? 'Waiting for wallet...' : 'Anchor on Solana'} variant="secondary"
                disabled={busy} onPress={anchor} />
            </>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <Text style={label}>AUTHORIZATIONS</Text>
        {d.authorizations.length === 0 && <Text style={{ color: colors.textFaint, fontSize: 13 }}>None yet.</Text>}
        {d.authorizations.map((x) => {
          const s = AUTH[x.status];
          const canRevoke = isOwner && x.terms.issuer === address &&
            ['ACTIVE', 'PENDING_APPROVAL', 'PENDING_PAYMENT', 'NOT_YET_VALID'].includes(x.status);
          return (
            <View key={x.terms.id} style={{ gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Chip label={s.label} tone={s.tone} dot />
                <Text style={muted}>to {short(x.terms.subject)}</Text>
              </View>
              <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                {x.terms.permissions.join(', ')} until {new Date(x.terms.expiresAt).toLocaleString()}
              </Text>
              {canRevoke && (
                <PrimaryButton label="Revoke" variant="secondary" onPress={async () => { await revoke(x, address!); load(); }} />
              )}
            </View>
          );
        })}
      </GlassCard>

      <GlassCard>
        <Text style={label}>HISTORY</Text>
        {d.history.length === 0 && <Text style={{ color: colors.textFaint, fontSize: 13 }}>No events yet.</Text>}
        {d.history.map((h) => (
          <View key={h.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{labelFor(h.type)}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>{timeAgo(h.at)}{h.detail ? ` · ${h.detail}` : ''}</Text>
          </View>
        ))}
      </GlassCard>

      <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}