import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../../lib/api';
import type { OrdenArmadoResumen, OAItem } from '../../../lib/types';

function fmtNum(v: string | number): string {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function ComponenteRow({ item }: { item: OAItem }) {
  const esServicio  = item.producto.tipo === 'servicio';
  const requerido   = Number(item.cantidadRequerida);
  const stockOk     = esServicio || item.producto.stock >= requerido;

  return (
    <View style={styles.compoRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.compoNombre}>{item.producto.nombre}</Text>
        {esServicio && <Text style={styles.compoBadgeServicio}>servicio</Text>}
      </View>
      <View style={styles.compoNums}>
        <Text style={[styles.compoStock, !stockOk && styles.compoStockRojo]}>
          {esServicio ? '—' : `${fmtNum(item.producto.stock)} ${item.producto.unidad}`}
        </Text>
        <Text style={styles.compoRequerido}>
          {fmtNum(requerido)} {item.producto.unidad}
        </Text>
      </View>
    </View>
  );
}

export default function OADetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [oa,      setOa]      = useState<OrdenArmadoResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  const fetchOa = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: OrdenArmadoResumen }>(`/ordenes-armado/${id}`);
      setOa(data.data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la orden');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOa(); }, [fetchOa]);

  async function handleEjecutar() {
    Alert.alert(
      'Ejecutar armado',
      `¿Confirmás que armaste ${fmtNum(oa!.cantidadAProducir)} unidades de ${oa!.kit.nombre}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: async () => {
            setSaving(true);
            try {
              await api.post(`/ordenes-armado/${id}/ejecutar`);
              Alert.alert('Listo', 'Armado ejecutado correctamente', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } catch (e: any) {
              Alert.alert('Error', e.response?.data?.error ?? 'No se pudo ejecutar');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  }

  if (loading || !oa) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Info general */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Orden de armado</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Número</Text>
          <Text style={styles.infoValue}>{oa.numero}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Kit</Text>
          <Text style={styles.infoValue}>{oa.kit.nombre}</Text>
        </View>
        {oa.kit.codigo && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Código</Text>
            <Text style={styles.infoValue}>{oa.kit.codigo}</Text>
          </View>
        )}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Cantidad</Text>
          <Text style={styles.infoValue}>{fmtNum(oa.cantidadAProducir)} {oa.kit.unidad}</Text>
        </View>
        {oa.notas && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Notas</Text>
            <Text style={[styles.infoValue, { flex: 1 }]}>{oa.notas}</Text>
          </View>
        )}
      </View>

      {/* Componentes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Componentes</Text>

        <View style={styles.compoHeader}>
          <Text style={[styles.compoHeaderText, { flex: 1 }]}>COMPONENTE</Text>
          <View style={styles.compoNums}>
            <Text style={styles.compoHeaderText}>STOCK</Text>
            <Text style={styles.compoHeaderText}>REQUERIDO</Text>
          </View>
        </View>

        {oa.items.map((item) => (
          <ComponenteRow key={item.id} item={item} />
        ))}
      </View>

      {/* Botón ejecutar */}
      {oa.estado === 'pendiente' && (
        <TouchableOpacity
          style={[styles.ejecutarBtn, saving && styles.ejecutarBtnDisabled]}
          onPress={handleEjecutar}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.ejecutarBtnText}>EJECUTAR ARMADO</Text>}
        </TouchableOpacity>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content:   { padding: 12, gap: 12, paddingBottom: 40 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },

  section: {
    backgroundColor: '#141414',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    padding: 16,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8500A',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  infoLabel: { fontSize: 12, color: '#888888', width: 80, flexShrink: 0 },
  infoValue: { fontSize: 14, color: '#F5F5F5', fontWeight: '500' },

  compoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
    marginBottom: 4,
  },
  compoHeaderText: {
    fontSize: 10,
    color: '#555555',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    width: 80,
    textAlign: 'right',
  },
  compoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
    gap: 8,
  },
  compoNombre: { fontSize: 14, color: '#F5F5F5', fontWeight: '500' },
  compoBadgeServicio: {
    fontSize: 10,
    color: '#888888',
    backgroundColor: '#1F1F1F',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  compoNums: { flexDirection: 'row', gap: 8 },
  compoStock: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
    width: 80,
    textAlign: 'right',
  },
  compoStockRojo: { color: '#E84040' },
  compoRequerido: {
    fontSize: 13,
    color: '#F5F5F5',
    width: 80,
    textAlign: 'right',
  },

  ejecutarBtn: {
    backgroundColor: '#1A6E3A',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  ejecutarBtnDisabled: { opacity: 0.5 },
  ejecutarBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
