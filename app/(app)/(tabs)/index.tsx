import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import api from '../../../lib/api';
import { logout, getUser } from '../../../lib/auth';
import EstadoBadge from '../../../components/EstadoBadge';
import type { OTResumen, OrdenArmadoResumen } from '../../../lib/types';

const TIPO_LABEL: Record<string, string> = {
  correctivo:  'Correctivo',
  preventivo:  'Preventivo',
  instalacion: 'Instalación',
};

const PRIORIDAD_COLOR: Record<string, string> = {
  baja:    '#555',
  normal:  '#888',
  alta:    '#E8A020',
  urgente: '#E84040',
};

function formatFecha(fecha: string | null, hora: string | null): string {
  if (!fecha) return 'Sin fecha';
  const d = new Date(fecha);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  const h = hora ? ` ${hora.slice(0, 5)}` : '';
  return `${dd}/${mm}/${yy}${h}`;
}

function nombreCliente(c: OTResumen['cliente']): string {
  if (c.empresa) return c.empresa;
  return [c.nombre, c.apellido].filter(Boolean).join(' ');
}

export default function HomeScreen() {
  const [ots,  setOts]             = useState<OTResumen[]>([]);
  const [oas,  setOas]             = useState<OrdenArmadoResumen[]>([]);
  const [loading, setLoading]      = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName]    = useState('');

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [reOts, reOas] = await Promise.all([
        api.get<{ data: OTResumen[] }>('/ots/mis-ots'),
        api.get<{ data: OrdenArmadoResumen[] }>('/ordenes-armado/mis-ordenes'),
      ]);
      setOts(reOts.data.data);
      setOas(reOas.data.data);
    } catch {
      Alert.alert('Error', 'No se pudieron cargar las órdenes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    getUser().then((u) => { if (u) setUserName(u.nombre || u.email || ''); });
  }, [fetchAll]);

  async function handleLogout() {
    await logout();
    router.replace('/(auth)/login');
  }

  function renderOA({ item }: { item: OrdenArmadoResumen }) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.cardOA]}
        onPress={() => router.push(`/oa/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardNumero, styles.cardNumeroOA]}>{item.numero}</Text>
          <Text style={styles.oaBadge}>ARMADO</Text>
        </View>
        <Text style={styles.cardCliente}>{item.kit.nombre}</Text>
        <Text style={styles.cardDesc}>
          Producir {Number.isInteger(Number(item.cantidadAProducir))
            ? Number(item.cantidadAProducir)
            : Number(item.cantidadAProducir).toFixed(2)} {item.kit.unidad} · {item.items.length} componentes
        </Text>
        {item.notas && (
          <Text style={styles.cardDesc} numberOfLines={1}>{item.notas}</Text>
        )}
      </TouchableOpacity>
    );
  }

  function renderItem({ item }: { item: OTResumen }) {
    const pColor = PRIORIDAD_COLOR[item.prioridad] ?? '#888';
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/ot/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardNumero}>OT #{item.numero}</Text>
          <EstadoBadge estado={item.estado} />
        </View>

        <Text style={styles.cardCliente}>{nombreCliente(item.cliente)}</Text>
        <Text style={styles.cardDesc} numberOfLines={2}>{item.descripcion}</Text>

        {item.equipo && (
          <Text style={styles.cardEquipo}>
            {item.equipo.marca} {item.equipo.modelo}
            {item.equipo.numero_serie ? ` · S/N ${item.equipo.numero_serie}` : ''}
          </Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.cardTipo}>{TIPO_LABEL[item.tipo] ?? item.tipo}</Text>
          <View style={styles.cardFooterRight}>
            <View style={[styles.prioDot, { backgroundColor: pColor }]} />
            <Text style={styles.cardFecha}>{formatFecha(item.fecha_programada, item.hora_programada)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topBarTitle}>Mis órdenes</Text>
          {userName ? <Text style={styles.topBarSub}>{userName}</Text> : null}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>SALIR</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchAll(true)}
            tintColor="#E8500A"
            colors={['#E8500A']}
          />
        }
      >
        {/* OTs */}
        {ots.length > 0 && (
          <Text style={styles.sectionHeader}>Órdenes de trabajo</Text>
        )}
        {ots.map((item) => (
          <View key={item.id}>
            {renderItem({ item })}
          </View>
        ))}

        {/* OAs */}
        {oas.length > 0 && (
          <Text style={[styles.sectionHeader, ots.length > 0 && { marginTop: 8 }]}>
            Órdenes de armado
          </Text>
        )}
        {oas.map((item) => (
          <View key={item.id}>
            {renderOA({ item })}
          </View>
        ))}

        {ots.length === 0 && oas.length === 0 && (
          <View style={styles.emptyInner}>
            <Text style={styles.emptyText}>No tenés órdenes asignadas</Text>
            <Text style={styles.emptyHint}>Deslizá para actualizar</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1F1F1F',
  },
  topBarTitle: { fontSize: 18, fontWeight: '700', color: '#F5F5F5' },
  topBarSub:   { fontSize: 12, color: '#888888', marginTop: 2 },
  logoutBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 4,
  },
  logoutText:   { fontSize: 11, fontWeight: '700', color: '#888888', letterSpacing: 1 },
  listContent:  { padding: 12, paddingBottom: 40 },
  emptyContainer: { flex: 1 },
  emptyInner: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, gap: 8 },
  emptyText:  { color: '#888888', fontSize: 16 },
  emptyHint:  { color: '#555555', fontSize: 13 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: '#555555',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  card: {
    backgroundColor: '#141414', borderRadius: 8,
    borderWidth: 1, borderColor: '#1F1F1F', padding: 14, gap: 6,
    marginBottom: 10,
  },
  cardOA: { borderColor: '#2A3D2A' },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardNumero:     { fontSize: 13, fontWeight: '700', color: '#E8500A', letterSpacing: 0.5 },
  cardNumeroOA:   { color: '#4CAF50' },
  oaBadge: {
    fontSize: 10, fontWeight: '700', color: '#4CAF50',
    backgroundColor: '#0D2D0D', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, letterSpacing: 0.8,
  },
  cardCliente:    { fontSize: 15, fontWeight: '600', color: '#F5F5F5' },
  cardDesc:       { fontSize: 13, color: '#888888', lineHeight: 18 },
  cardEquipo:     { fontSize: 12, color: '#666666', fontStyle: 'italic' },
  cardFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  cardTipo:       { fontSize: 11, color: '#666666', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardFooterRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prioDot:        { width: 6, height: 6, borderRadius: 3 },
  cardFecha:      { fontSize: 12, color: '#888888' },
});
