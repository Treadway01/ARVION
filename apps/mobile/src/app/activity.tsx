import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../components/Screen';
import { GlassCard } from '../components/GlassCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { EmptyState } from '../components/EmptyState';
import { SkeletonCard } from '../components/Skeleton';
import { Chip } from '../components/Chip';
import { FadeIn } from '../components/FadeIn';
import { useWallet } from '../store/wallet';
import { ActivityRow, api } from '../services/api';
import { Category, categoryOf, dayGroup, labelFor, resultOf, timeAgo, toneOf } from '../utils/activity';
import { colors } from '../theme/tokens';

const FILTERS: ('All' | Category)[] = ['All', 'Identity', 'Authorization', 'Access', 'Assets', 'Payments', 'Security'];
const GROUPS = ['Today', 'Yesterday', 'Earlier'] as const;
const dot = (type: string) => {
  const t = toneOf(type);
  return t === 'ok' ? colors.ok : t === 'danger' ? colors.danger : t === 'warn' ? colors.warn : t === 'cyan' ? colors.cyan : t === 'neutral' ? colors.textMuted : colors.purple;
};
const muted = { color: colors.textMuted, fontSize: 12 } as const;

export default function Activity() {
  const router = useRouter();
  const { address } = useWallet();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [filter, setFilter] = useState<'All' | Category>('All');

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(undefined);
    const r = await api.activity(address);
    if (r.ok) setRows(r.value);
    else setError(r.error.message);
    setLoading(false);
    setLoaded(true);
  }, [address]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!address)
    return (
      <Screen title="Activity">
        <EmptyState title="Connect your wallet" body="Connect on the Identity tab to see your activity." />
      </Screen>
    );

  const shown = rows.filter((r) => filter === 'All' || categoryOf(r.type) === filter);

  function detail(r: ActivityRow) {
    const related = r.authorization_id
      ? rows.filter((x) => x.authorization_id === r.authorization_id && x.id !== r.id).sort((a, b) => a.at - b.at)
      : [];
    return (
      <View style={{ gap: 6, paddingVertical: 10, paddingLeft: 22 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          <Chip label={categoryOf(r.type)} />
          <Chip label={resultOf(r.type)} tone={toneOf(r.type)} dot />
        </View>
        <Text style={muted}>{new Date(r.at).toLocaleString()}</Text>
        {r.resource_id && <Text style={muted}>Resource: {r.resource_id}</Text>}
        {r.detail && <Text style={{ color: colors.warn, fontSize: 12 }}>{r.detail}</Text>}
        {related.length > 0 && (
          <View style={{ gap: 2 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 }}>RELATED EVENTS</Text>
            {related.map((x) => (
              <Text key={x.id} style={muted}>• {labelFor(x.type)} · {timeAgo(x.at)}</Text>
            ))}
          </View>
        )}
        {r.authorization_id && (
          <PrimaryButton label="Open authorization" variant="secondary"
            onPress={() => router.push(`/authorization/${r.authorization_id}`)} />
        )}
        {r.resource_id?.startsWith('asset_') && (
          <PrimaryButton label="Open asset" variant="secondary" onPress={() => router.push(`/asset/${r.resource_id}`)} />
        )}
      </View>
    );
  }

  return (
    <Screen title="Activity">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Chip label="Live from the API" tone="cyan" dot />
        <View style={{ width: 110 }}>
          <PrimaryButton label={loading ? 'Loading...' : 'Refresh'} variant="secondary" disabled={loading} onPress={load} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {FILTERS.map((f) => (
          <Pressable key={f} accessibilityRole="button" onPress={() => setFilter(f)}>
            <Chip label={f} tone={filter === f ? 'purple' : 'neutral'} dot={filter === f} />
          </Pressable>
        ))}
      </View>

      {error && (
        <GlassCard accent={colors.danger}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>Could not load activity</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{error}</Text>
          <PrimaryButton label="Retry" onPress={load} />
        </GlassCard>
      )}

      {loading && !loaded && (<><SkeletonCard /><SkeletonCard /></>)}

      {loaded && !error && shown.length === 0 && (
        <GlassCard>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>No activity yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Actions across your identity, authorizations, access and assets will appear here.
          </Text>
        </GlassCard>
      )}

      {GROUPS.map((g) => {
        const list = shown.filter((r) => dayGroup(r.at) === g);
        if (list.length === 0) return null;
        return (
          <FadeIn key={g}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 }}>
              {g.toUpperCase()}
            </Text>
            <GlassCard>
              {list.map((r) => (
                <View key={r.id}>
                  <Pressable accessibilityRole="button" onPress={() => setOpen(open === r.id ? null : r.id)}>
                    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot(r.type) }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{labelFor(r.type)}</Text>
                        <Text style={muted}>
                          {r.resource_id ? `${r.resource_id.slice(0, 18)} · ` : ''}{timeAgo(r.at)}
                        </Text>
                      </View>
                      <Text style={{ color: colors.textFaint, fontSize: 12 }}>{open === r.id ? '▲' : '▼'}</Text>
                    </View>
                  </Pressable>
                  {open === r.id && detail(r)}
                </View>
              ))}
            </GlassCard>
          </FadeIn>
        );
      })}
    </Screen>
  );
}
