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
import * as Location from 'expo-location';
import api from '../../../lib/api';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FichajeRecord {
  id:            string;
  tipo:          'ingreso' | 'salida';
  registrado_en: string;
  latitud:       number | null;
  longitud:      number | null;
}

interface TallerConfig {
  taller_latitud:       number | null;
  taller_longitud:      number | null;
  fichaje_radio_metros: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

// Haversine — igual que el backend
function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function FichajeScreen() {
  const [fichajes,  setFichajes]  = useState<FichajeRecord[]>([]);
  const [config,    setConfig]    = useState<TallerConfig | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [fichando,  setFichando]  = useState(false);

  const fetchDatos = useCallback(async () => {
    try {
      const [fichajesRes, configRes] = await Promise.all([
        api.get<{ data: FichajeRecord[] }>('/fichajes/hoy'),
        api.get<{ data: TallerConfig }>('/fichajes/config'),
      ]);
      setFichajes(fichajesRes.data.data);
      setConfig(configRes.data.data);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la información');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDatos(); }, [fetchDatos]);

  // Determinar próxima acción según último fichaje del día
  const ultimoFichaje = fichajes[fichajes.length - 1];
  const proximoTipo: 'ingreso' | 'salida' =
    !ultimoFichaje || ultimoFichaje.tipo === 'salida' ? 'ingreso' : 'salida';

  async function handleFichar() {
    setFichando(true);
    try {
      // Pedir permiso de ubicación
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso requerido',
          'Necesitamos tu ubicación para registrar el fichaje. Habilitá el permiso en Configuración.'
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude: lat, longitude: lng } = pos.coords;

      // Validación previa en el cliente (UX) — el backend también valida
      if (config?.taller_latitud != null && config?.taller_longitud != null) {
        const dist = distanciaMetros(lat, lng, config.taller_latitud, config.taller_longitud);
        const radio = config.fichaje_radio_metros ?? 50;
        if (dist > radio) {
          Alert.alert(
            'Fuera del taller',
            `Estás a ${Math.round(dist)}m del taller. Debés estar a menos de ${radio}m para fichar.`
          );
          return;
        }
      }

      await api.post('/fichajes', {
        tipo:     proximoTipo,
        latitud:  lat,
        longitud: lng,
      });

      await fetchDatos();

      Alert.alert(
        proximoTipo === 'ingreso' ? '✅ Ingreso registrado' : '✅ Salida registrada',
        `${formatHora(new Date().toISOString())}`
      );
    } catch (e: any) {
      const msg = e.response?.data?.message || e.response?.data?.error || 'No se pudo registrar el fichaje';
      Alert.alert('Error', msg);
    } finally {
      setFichando(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  const esIngreso = proximoTipo === 'ingreso';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* ── Botón principal ── */}
      <View style={styles.fichajeCard}>
        <Text style={styles.fichajeHoy}>HOY — {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>

        <TouchableOpacity
          style={[styles.fichajeBtn, esIngreso ? styles.fichajeBtnIngreso : styles.fichajeBtnSalida, fichando && styles.fichajeBtnDisabled]}
          onPress={handleFichar}
          disabled={fichando}
          activeOpacity={0.8}
        >
          {fichando ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <>
              <Text style={styles.fichajeBtnIcon}>{esIngreso ? '▶' : '■'}</Text>
              <Text style={styles.fichajeBtnLabel}>
                {esIngreso ? 'MARCAR INGRESO' : 'MARCAR SALIDA'}
              </Text>
              <Text style={styles.fichajeBtnHint}>
                {esIngreso ? 'Inicio de jornada' : 'Fin de jornada'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {config?.taller_latitud != null ? (
          <Text style={styles.radioHint}>
            Radio permitido: {config.fichaje_radio_metros}m desde el taller
          </Text>
        ) : (
          <Text style={styles.radioHintWarning}>
            ⚠ Sin ubicación de taller configurada — se permite fichar desde cualquier lugar
          </Text>
        )}
      </View>

      {/* ── Registros de hoy ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Registros de hoy</Text>

        {fichajes.length === 0 ? (
          <Text style={styles.emptyText}>Sin fichajes registrados hoy</Text>
        ) : (
          fichajes.map((f) => (
            <View key={f.id} style={styles.fichajeRow}>
              <View style={[styles.tipoBadge, f.tipo === 'ingreso' ? styles.tipoBadgeIngreso : styles.tipoBadgeSalida]}>
                <Text style={styles.tipoText}>{f.tipo === 'ingreso' ? 'INGRESO' : 'SALIDA'}</Text>
              </View>
              <Text style={styles.fichajeHora}>{formatHora(f.registrado_en)}</Text>
              {f.latitud != null && (
                <Text style={styles.fichajeGps}>📍</Text>
              )}
            </View>
          ))
        )}
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content:   { padding: 16, gap: 16, paddingBottom: 40 },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A' },

  fichajeCard: {
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#1F1F1F', padding: 20, alignItems: 'center', gap: 16,
  },
  fichajeHoy: { fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },

  fichajeBtn: {
    width: '100%', borderRadius: 10, paddingVertical: 28,
    alignItems: 'center', gap: 6,
  },
  fichajeBtnIngreso:  { backgroundColor: '#1A5E2A' },
  fichajeBtnSalida:   { backgroundColor: '#6B1A1A' },
  fichajeBtnDisabled: { opacity: 0.5 },
  fichajeBtnIcon:  { fontSize: 28, color: '#fff' },
  fichajeBtnLabel: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 2 },
  fichajeBtnHint:  { fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 },

  radioHint:        { fontSize: 11, color: '#555', textAlign: 'center' },
  radioHintWarning: { fontSize: 11, color: '#8B6914', textAlign: 'center' },

  section:      { backgroundColor: '#141414', borderRadius: 8, borderWidth: 1, borderColor: '#1F1F1F', padding: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#E8500A', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  emptyText:    { color: '#555', fontSize: 14, textAlign: 'center', paddingVertical: 8 },

  fichajeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
  },
  tipoBadge:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  tipoBadgeIngreso:  { backgroundColor: 'rgba(26,94,42,0.4)' },
  tipoBadgeSalida:   { backgroundColor: 'rgba(107,26,26,0.4)' },
  tipoText:          { fontSize: 11, fontWeight: '700', color: '#F5F5F5', letterSpacing: 0.5 },
  fichajeHora:       { fontSize: 18, fontWeight: '700', color: '#F5F5F5', flex: 1 },
  fichajeGps:        { fontSize: 14 },
});
