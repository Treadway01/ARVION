import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { InfoRow } from '../components/InfoRow';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { useIdentity } from '../store/identity';
import { findSgtMint } from '../providers/identity/sgt';
import { colors, font } from '../theme/tokens';

const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;
const short = (s: string) => `${s.slice(0, 8)}...${s.slice(-6)}`;

export default function Identity() {
  const { status, address, error, connect, disconnect } = useWallet();
  const { sgt, skr, load } = useIdentity();
  const connected = status === 'connected' && !!address;
  const [lookup, setLookup] = useState('');
  const [lookupResult, setLookupResult] = useState<string>();

  useEffect(() => {
    if (connected && address) load(address);
  }, [connected, address, load]);

  async function runLookup() {
    setLookupResult('Checking...');
    const r = await findSgtMint(lookup);
    setLookupResult(!r.ok ? r.error.message : r.value ? `Holds an SGT (mint ${short(r.value)})` : 'No SGT found.');
  }

  function recheck() {
    if (!address) return;
    useIdentity.setState({ address: undefined });
    load(address);
  }

  const sgtChip =
    sgt.state === 'found' ? <Chip label="Verified" tone="ok" dot />
    : sgt.state === 'none' ? <Chip label="Not found" />
    : sgt.state === 'error' ? <Chip label="Unavailable" tone="warn" />
    : sgt.state === 'checking' ? <Chip label="Checking" tone="cyan" />
    : <Chip label="Not checked" />;

  const skrChip =
    skr.state === 'found' ? <Chip label="Found" tone="cyan" dot />
    : skr.state === 'none' ? <Chip label="None" />
    : skr.state === 'error' ? <Chip label="Unavailable" tone="warn" />
    : skr.state === 'checking' ? <Chip label="Checking" tone="cyan" />
    : <Chip label="Not checked" />;

  return (
    <Screen title="Identity">
      <FadeIn>
        <GlassCard raised>
          <Text style={label}>IDENTITY</Text>
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 }}>
            {connected ? (skr.state === 'found' && skr.value ? skr.value : 'Wallet connected') : 'Not connected'}
          </Text>
          {connected ? (
            <Text selectable style={{ color: colors.textMuted, fontSize: 13, fontFamily: font.mono }}>
              {short(address!)}
            </Text>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              Connect a Solana wallet to load your identity.
            </Text>
          )}
          {error && <Text style={{ color: colors.danger, fontSize: 14 }}>{error.message}</Text>}
          <View style={{ marginTop: 6 }}>
            <PrimaryButton
              label={status === 'connecting' ? 'Connecting...' : connected ? 'Disconnect' : 'Connect wallet'}
              disabled={status === 'connecting'}
              variant={connected ? 'secondary' : 'primary'}
              onPress={connected ? disconnect : connect}
            />
          </View>
        </GlassCard>
      </FadeIn>

      <FadeIn delay={80}>
        <GlassCard>
          <Text style={label}>VERIFICATION</Text>
          <InfoRow
            label="Wallet"
            value={connected ? 'Connected through Mobile Wallet Adapter' : undefined}
            chip={connected ? <Chip label="Connected" tone="ok" dot /> : <Chip label="Not connected" />}
          />
          <InfoRow
            label="Seeker Genesis Token"
            value={sgt.state === 'found' && sgt.value ? `Mint ${short(sgt.value)} (mainnet)` : undefined}
            mono
            chip={sgtChip}
          />
          <InfoRow
            label=".skr name"
            value={skr.state === 'found' ? skr.value : undefined}
            chip={skrChip}
          />
          {sgt.state === 'none' && (
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>
              This wallet holds no Seeker Genesis Token. Access and OWNR still work.
            </Text>
          )}
          <Text style={{ color: colors.textFaint, fontSize: 12 }}>
            Read from Solana mainnet. Wallet-ownership signing (SIWS) is on the roadmap.
          </Text>
          {connected && <PrimaryButton label="Re-check" variant="secondary" onPress={recheck} />}
        </GlassCard>
      </FadeIn>

      {__DEV__ && (
        <FadeIn delay={140}>
          <GlassCard>
            <Chip label="Simulation: developer tool" tone="warn" />
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              Checks any public address for an SGT. This is not your identity.
            </Text>
            <Field placeholder="Wallet address" autoCapitalize="none" autoCorrect={false}
              value={lookup} onChangeText={setLookup} />
            <PrimaryButton label="Look up" variant="secondary" onPress={runLookup} />
            {lookupResult && <Text style={{ color: colors.text, fontSize: 14 }}>{lookupResult}</Text>}
          </GlassCard>
        </FadeIn>
      )}
    </Screen>
  );
}