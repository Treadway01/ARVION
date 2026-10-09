import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ASSET_CATEGORIES } from '@seeker/shared';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { Chip } from '../components/Chip';
import { Field } from '../components/Field';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { captureAssetImage, prepareImage } from '../providers/camera/camera';
import { createAssetRecord } from '../providers/assets/records';
import { explorerTx } from '../services/solana';
import { colors, font, radius } from '../theme/tokens';

type Step = 'capture' | 'preview' | 'details' | 'review' | 'creating' | 'done';
const STEP_NO: Record<Step, number> = { capture: 1, preview: 1, details: 2, review: 3, creating: 4, done: 4 };
const label = { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 } as const;
const muted = { color: colors.textMuted, fontSize: 13 } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const img = { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surface } as const;

export default function CreateAsset() {
  const router = useRouter();
  const { address, status } = useWallet();
  const [step, setStep] = useState<Step>('capture');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [photo, setPhoto] = useState<{ uri: string; base64: string }>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('equipment');
  const [description, setDescription] = useState('');
  const [serial, setSerial] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [reference, setReference] = useState('');
  const [onChain, setOnChain] = useState(false);
  const [mintedMint, setMintedMint] = useState<string>();
  const [result, setResult] = useState<{ id: string; mint: string | null; signature?: string }>();

  if (status !== 'connected' || !address)
    return (
      <Screen title="Create asset">
        <EmptyState title="Connect your wallet" body="The connected wallet becomes the owner and signs the asset." />
      </Screen>
    );

  const trimmed = (s: string) => s.trim();
  const meta = {
    description: trimmed(description), serial: trimmed(serial), manufacturer: trimmed(manufacturer),
    model: trimmed(model), reference: trimmed(reference),
  };

  async function capture() {
    setError(undefined);
    setBusy(true);
    const c = await captureAssetImage();
    if (!c.ok) { setBusy(false); setError(c.error.message); return; }
    const p = await prepareImage(c.value.uri);
    setBusy(false);
    if (!p.ok) { setError(p.error.message); return; }
    setPhoto(p.value);
    setStep('preview');
  }

  function toReview() {
    if (!trimmed(name) || trimmed(name).length > 40) {
      setError('Give the asset a name (up to 40 characters).');
      return;
    }
    setError(undefined);
    setStep('review');
  }

  async function create() {
    if (!photo) return;
    setStep('creating');
    setError(undefined);
    const r = await createAssetRecord(address!, {
      name, category, meta, photoBase64: photo.base64, onChain, existingMint: mintedMint,
      onMinted: (m) => setMintedMint(m),
    });
    if (!r.ok) { setError(r.error.message); setStep('review'); return; }
    setResult(r.value);
    setStep('done');
  }

  const Header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Chip label={`Step ${STEP_NO[step]} of 4`} tone="cyan" />
      {step !== 'creating' && step !== 'done' && (
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Cancel</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <Screen title="Create asset">
      {Header}

      {error && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 14 }}>{error}</Text>
        </GlassCard>
      )}

      {step === 'capture' && (
        <FadeIn>
          <GlassCard raised>
            <Text style={label}>CAPTURE</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Photograph the item</Text>
            <Text style={muted}>
              Equipment, a device, a collectible, a membership card, a certificate, a ticket. The photo is a picture
              of the item, not proof that you own it.
            </Text>
            <PrimaryButton label={busy ? 'Opening camera...' : 'Open camera'} disabled={busy} onPress={capture} />
          </GlassCard>
        </FadeIn>
      )}

      {step === 'preview' && photo && (
        <FadeIn>
          <GlassCard raised>
            <Image source={{ uri: photo.uri }} style={img} resizeMode="cover" />
            <PrimaryButton label="Use photo" onPress={() => setStep('details')} />
            <PrimaryButton label={busy ? 'Opening camera...' : 'Retake'} variant="secondary" disabled={busy} onPress={capture} />
          </GlassCard>
        </FadeIn>
      )}

      {step === 'details' && (
        <FadeIn>
          <GlassCard raised>
            <Text style={label}>DETAILS</Text>
            <Field placeholder="Asset name (e.g. Camera #042)" value={name} onChangeText={setName} maxLength={40} />
            <Text style={label}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ASSET_CATEGORIES.map((c) => (
                <Pressable key={c} accessibilityRole="button" onPress={() => setCategory(c)}>
                  <Chip label={cap(c)} tone={category === c ? 'purple' : 'neutral'} dot={category === c} />
                </Pressable>
              ))}
            </View>
            <Field placeholder="Description (optional)" value={description} onChangeText={setDescription}
              multiline maxLength={500} />
            <Field placeholder="Serial number (optional)" value={serial} onChangeText={setSerial} maxLength={120} />
            <Field placeholder="Manufacturer (optional)" value={manufacturer} onChangeText={setManufacturer} maxLength={120} />
            <Field placeholder="Model (optional)" value={model} onChangeText={setModel} maxLength={120} />
            <Field placeholder="Purchase or reference info (optional)" value={reference} onChangeText={setReference} maxLength={120} />
            <PrimaryButton label="Review" onPress={toReview} />
            <PrimaryButton label="Back" variant="secondary" onPress={() => setStep('preview')} />
          </GlassCard>
        </FadeIn>
      )}

      {step === 'review' && photo && (
        <FadeIn>
          <GlassCard raised>
            <Text style={label}>REVIEW</Text>
            <Image source={{ uri: photo.uri }} style={img} resizeMode="cover" />
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{trimmed(name)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Chip label={cap(category)} />
              <Chip label={onChain ? 'On-chain after creation' : 'User declared'} tone={onChain ? 'ok' : 'warn'} dot />
            </View>
            <Text style={muted}>
              Owner <Text style={{ fontFamily: font.mono }}>{address.slice(0, 6)}...{address.slice(-6)}</Text>
            </Text>
            {meta.description ? <Text style={muted}>{meta.description}</Text> : null}

            <Text style={label}>OWNERSHIP</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => setOnChain(false)}>
                <Chip label="Record only" tone={!onChain ? 'purple' : 'neutral'} dot={!onChain} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setOnChain(true)}>
                <Chip label="Record + on-chain" tone={onChain ? 'purple' : 'neutral'} dot={onChain} />
              </Pressable>
            </View>
            <Text style={{ color: colors.textFaint, fontSize: 12 }}>
              {onChain
                ? 'Creates a 1-of-1 token on Solana in your wallet (a small network fee applies), then saves your signed record. Needed to transfer the asset.'
                : 'Saves a record signed by your wallet. A photo does not prove ownership, so this stays User declared. You can anchor it on Solana later.'}
            </Text>
            {mintedMint && (
              <Text style={{ color: colors.cyan, fontSize: 12 }}>
                A token was already created for this asset ({mintedMint.slice(0, 8)}...). Retrying reuses it.
              </Text>
            )}

            <PrimaryButton label="Create asset" onPress={create} />
            <PrimaryButton label="Edit details" variant="secondary" onPress={() => setStep('details')} />
          </GlassCard>
        </FadeIn>
      )}

      {step === 'creating' && (
        <GlassCard raised>
          <Chip label="Working" tone="cyan" dot />
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>Creating your asset...</Text>
          <Text style={muted}>
            {onChain && !mintedMint
              ? 'Confirm the token transaction in your wallet, then sign the asset record.'
              : 'Sign the asset record in your wallet.'}
          </Text>
        </GlassCard>
      )}

      {step === 'done' && result && photo && (
        <FadeIn>
          <GlassCard raised accent={colors.ok}>
            <Chip label="Asset created" tone="ok" dot />
            <Image source={{ uri: photo.uri }} style={img} resizeMode="cover" />
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700' }}>{trimmed(name)}</Text>
            <Chip label={result.mint ? 'On-chain verified' : 'User declared'} tone={result.mint ? 'ok' : 'warn'} dot />
            {result.signature && (
              <Text style={{ color: colors.cyan, fontSize: 13 }} onPress={() => Linking.openURL(explorerTx(result.signature!))}>
                View transaction on Solana Explorer
              </Text>
            )}
            <PrimaryButton label="Open asset" onPress={() => router.replace(`/asset/${result.id}`)} />
            <PrimaryButton label="Back to OWNR" variant="secondary" onPress={() => router.replace('/ownr')} />
          </GlassCard>
        </FadeIn>
      )}
    </Screen>
  );
}