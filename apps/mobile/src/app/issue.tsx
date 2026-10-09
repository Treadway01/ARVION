import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthorizationTerms, issueMessage, newNonce } from '@seeker/shared';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { mwaWalletProvider } from '../providers/wallet/mwa';
import { getSkrInfo } from '../providers/payment/skr';
import { api } from '../services/api';
import { env } from '../config/env';
import { parseAmount } from '../utils/amount';
import { colors } from '../theme/tokens';

const DURATIONS = [
  { label: '10 min', ms: 10 * 60_000 },
  { label: '1 hour', ms: 3_600_000 },
  { label: '1 day', ms: 86_400_000 },
  { label: '30 days', ms: 30 * 86_400_000 },
];
const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;

export default function Issue() {
  const router = useRouter();
  const params = useLocalSearchParams<{ resourceId?: string; resourceName?: string; kind?: string; self?: string }>();
  const isAsset = params.kind === 'asset';
  const { address, status } = useWallet();
  const [subject, setSubject] = useState(params.self === '1' ? (address ?? '') : '');
  const [name, setName] = useState(params.resourceName ?? '');
  const [durationMs, setDurationMs] = useState(DURATIONS[3].ms);
  const [paid, setPaid] = useState(false);
  const [priceText, setPriceText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean }>();

  if (status !== 'connected' || !address)
    return (
      <Screen title="Issue">
        <EmptyState title="Connect your wallet" body="The connected wallet becomes the issuer and signs the authorization." />
      </Screen>
    );

  const isSelf = subject.trim() === address;

  async function submit() {
    setMsg(undefined);
    if (!subject.trim() || !name.trim()) {
      setMsg({ text: 'Enter the holder address and a resource name.', ok: false });
      return;
    }
    setBusy(true);

    let price: AuthorizationTerms['price'];
    if (paid && !isSelf) {
      const info = await getSkrInfo();
      if (!info.ok) { setBusy(false); setMsg({ text: info.error.message, ok: false }); return; }
      const amount = parseAmount(priceText, info.value.decimals);
      if (!amount) {
        setBusy(false);
        setMsg({ text: `Enter a price in SKR (up to ${info.value.decimals} decimals).`, ok: false });
        return;
      }
      price = { mint: env.skrMint, amount, payTo: address! };
    }

    const now = Date.now();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'resource';
    const terms: AuthorizationTerms = {
      version: 1,
      id: `auth_${newNonce()}`,
      issuer: address!,
      subject: subject.trim(),
      resource: { id: params.resourceId ?? slug, name: name.trim(), kind: isAsset ? 'asset' : 'door' },
      permissions: [isAsset ? 'use' : 'entry'],
      issuedAt: now,
      expiresAt: now + durationMs,
      nonce: newNonce(),
      ...(price ? { price } : {}),
    };
    const sig = await mwaWalletProvider.signMessage(issueMessage(terms));
    if (!sig.ok) { setBusy(false); setMsg({ text: sig.error.message, ok: false }); return; }
    const r = await api.issue(terms, sig.value);
    setBusy(false);
    if (!r.ok) { setMsg({ text: r.error.message, ok: false }); return; }
    setMsg({
      text: price ? 'Issued with a price. The holder pays in SKR to activate it.' : 'Issued. The holder can now approve it on the Access tab.',
      ok: true,
    });
  }

  return (
    <Screen title="Issue">
      <FadeIn>
        <GlassCard raised>
          <Text style={label}>{isAsset ? 'AUTHORIZE USE OF AN ASSET' : 'NEW AUTHORIZATION'}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Issuing as {address.slice(0, 6)}...{address.slice(-4)}. You sign it, then the holder approves it.
          </Text>
          <Field placeholder="Holder wallet address" autoCapitalize="none" autoCorrect={false}
            value={subject} onChangeText={setSubject} />
          <PrimaryButton label="Use my own wallet" variant="secondary" onPress={() => setSubject(address!)} />
          <Field placeholder="Resource name (e.g. Demo Door 001)" value={name} onChangeText={setName}
            editable={!params.resourceName} />

          <Text style={label}>VALID FOR</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {DURATIONS.map((d) => {
              const selected = d.ms === durationMs;
              return (
                <Pressable key={d.label} accessibilityRole="button" accessibilityState={{ selected }}
                  onPress={() => setDurationMs(d.ms)}>
                  <Chip label={d.label} tone={selected ? 'purple' : 'neutral'} dot={selected} />
                </Pressable>
              );
            })}
          </View>

          {isSelf ? (
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>
              Access to your own wallet is always free.
            </Text>
          ) : (
            <>
              <Text style={label}>ACCESS PRICE</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => setPaid(false)}>
                  <Chip label="Free" tone={!paid ? 'purple' : 'neutral'} dot={!paid} />
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setPaid(true)}>
                  <Chip label="Require SKR payment" tone={paid ? 'purple' : 'neutral'} dot={paid} />
                </Pressable>
              </View>
              {paid && (
                <>
                  <Field placeholder="Price in SKR (e.g. 10)" keyboardType="decimal-pad"
                    value={priceText} onChangeText={setPriceText} />
                  <Text style={{ color: colors.textFaint, fontSize: 12 }}>
                    The holder pays this to your wallet. Access stays inactive until the payment is verified on-chain.
                  </Text>
                </>
              )}
            </>
          )}

          {msg && <Text style={{ color: msg.ok ? colors.ok : colors.danger, fontSize: 14 }}>{msg.text}</Text>}
          <PrimaryButton label={busy ? 'Waiting for wallet...' : 'Sign and issue'} disabled={busy} onPress={submit} />
          <PrimaryButton label="Back" variant="secondary" onPress={() => router.back()} />
        </GlassCard>
      </FadeIn>
    </Screen>
  );
}