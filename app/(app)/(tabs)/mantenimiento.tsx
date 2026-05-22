import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  Modal, TextInput, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import api from '../../../lib/api';

interface Tarea {
  tipo: 'herramienta' | 'vehiculo';
  recurso_id: string;
  recurso_nombre: string;
  recurso_estado: string;
  tarea_id: string | number;
  tarea_nombre: string;
  descripcion: string | null;
  intervalo: string | null;
  ultima_fecha: string | null;
  proxima_fecha: string | null;
  dias_restantes: number | null;
  vencida: boolean;
}

function fmtFecha(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function urgenciaBadge(t: Tarea) {
  if (t.vencida) return { label: 'Vencida', bg: '#FEE2E2', text: '#DC2626' };
  if (t.dias_restantes !== null && t.dias_restantes === 0)
    return { label: 'Vence hoy', bg: '#FEE2E2', text: '#DC2626' };
  if (t.dias_restantes !== null && t.dias_restantes <= 7)
    return { label: `${t.dias_restantes}d`, bg: '#FFEDD5', text: '#EA580C' };
  return null;
}

function TipoIcon({ tipo }: { tipo: string }) {
  return <Text style={{ fontSize: 20 }}>{tipo === 'herramienta' ? '🔧' : '🚗'}</Text>;
}

export default function MantenimientoTab() {
  const [tareas,      setTareas]      = useState<Tarea[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [modalTarea,  setModalTarea]  = useState<Tarea | null>(null);
  const [notas,       setNotas]       = useState('');
  const [completando, setCompletando] = useState(false);

  async function cargar(isRefresh = false) {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { data } = await api.get('/mantenimiento/pendientes');
      setTareas(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { cargar(); }, []));

  async function completar() {
    if (!modalTarea) return;
    setCompletando(true);
    try {
      const path = modalTarea.tipo === 'herramienta'
        ? `/herramientas/${modalTarea.recurso_id}/mantenimientos/${modalTarea.tarea_id}/completar`
        : `/vehiculos/${modalTarea.recurso_id}/mantenimientos/${modalTarea.tarea_id}/completar`;
      await api.patch(path, { notas: notas || undefined });
      setModalTarea(null);
      setNotas('');
      cargar();
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.error ?? 'No se pudo registrar el mantenimiento');
    } finally {
      setCompletando(false);
    }
  }

  const renderItem = ({ item: t }: { item: Tarea }) => {
    const badge = urgenciaBadge(t);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => { setModalTarea(t); setNotas(''); }}
        activeOpacity={0.7}
      >
        <View style={styles.cardRow}>
          <TipoIcon tipo={t.tipo} />
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <Text style={styles.recursoNombre} numberOfLines={1}>{t.recurso_nombre}</Text>
              {badge && (
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
                </View>
              )}
            </View>
            <Text style={styles.tareaNombre}>{t.tarea_nombre}</Text>
            <View style={styles.meta}>
              {t.intervalo && <Text style={styles.metaText}>{t.intervalo}</Text>}
              {t.proxima_fecha && (
                <Text style={styles.metaText}>Próximo: {fmtFecha(t.proxima_fecha)}</Text>
              )}
            </View>
          </View>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tareas}
        keyExtractor={t => `${t.tipo}-${t.recurso_id}-${t.tarea_id}`}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => cargar(true)} tintColor="#E8500A" />}
        contentContainerStyle={tareas.length === 0 ? styles.emptyContainer : styles.listContainer}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyText}>No hay tareas de mantenimiento pendientes</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={styles.sectionHeader}>
            {tareas.length} tarea{tareas.length !== 1 ? 's' : ''}
          </Text>
        }
      />

      <Modal visible={!!modalTarea} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {modalTarea && (
              <>
                <View style={styles.modalHeader}>
                  <TipoIcon tipo={modalTarea.tipo} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.modalRecurso} numberOfLines={1}>{modalTarea.recurso_nombre}</Text>
                    <Text style={styles.modalTarea}>{modalTarea.tarea_nombre}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setModalTarea(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.modalMeta}>
                  {modalTarea.intervalo && (
                    <Text style={styles.metaItem}>Intervalo: {modalTarea.intervalo}</Text>
                  )}
                  <Text style={styles.metaItem}>Último: {fmtFecha(modalTarea.ultima_fecha)}</Text>
                  <Text style={styles.metaItem}>Próximo: {fmtFecha(modalTarea.proxima_fecha)}</Text>
                  {modalTarea.descripcion && (
                    <Text style={styles.metaItem}>{modalTarea.descripcion}</Text>
                  )}
                </View>

                <Text style={styles.notasLabel}>Notas (opcional)</Text>
                <TextInput
                  value={notas}
                  onChangeText={setNotas}
                  placeholder="Detalles del mantenimiento realizado…"
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={4}
                  style={styles.notasInput}
                />

                <TouchableOpacity
                  onPress={completar}
                  disabled={completando}
                  style={[styles.btnCompletar, completando && styles.btnDisabled]}
                >
                  <Text style={styles.btnCompletarText}>
                    {completando ? 'Guardando…' : '✓ Registrar mantenimiento'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0A0A0A' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  listContainer:  { padding: 16, paddingTop: 8 },
  sectionHeader:  { color: '#555', fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 12, marginTop: 4 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyText:      { color: '#555', fontSize: 14, textAlign: 'center' },

  card: {
    backgroundColor: '#141414',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  cardRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardContent: { flex: 1, minWidth: 0 },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  recursoNombre: { color: '#E0E0E0', fontSize: 14, fontWeight: '700', flexShrink: 1 },
  tareaNombre:   { color: '#AAAAAA', fontSize: 13, marginTop: 2 },
  meta:          { flexDirection: 'row', gap: 12, marginTop: 4, flexWrap: 'wrap' },
  metaText:      { color: '#555', fontSize: 11 },
  arrow:         { color: '#333', fontSize: 20 },

  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: '#2A2A2A',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  modalRecurso: { color: '#E0E0E0', fontSize: 15, fontWeight: '700' },
  modalTarea:   { color: '#AAAAAA', fontSize: 14, marginTop: 2 },
  modalClose:   { color: '#555', fontSize: 20, paddingLeft: 12 },
  modalMeta:    { backgroundColor: '#0A0A0A', borderRadius: 12, padding: 14, marginBottom: 16 },
  metaItem:     { color: '#888', fontSize: 12, marginBottom: 4 },

  notasLabel: { color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  notasInput: {
    backgroundColor: '#1F1F1F',
    borderRadius: 12,
    padding: 14,
    color: '#E0E0E0',
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  btnCompletar: {
    backgroundColor: '#16A34A',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnCompletarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
