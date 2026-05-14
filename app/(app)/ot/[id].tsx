import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import api from '../../../lib/api';
import { buildFileUrl } from '../../../lib/types';
import type {
  OrdenTrabajo,
  EstadoOT,
  OTChecklist,
  OTFoto,
  OTClienteDetalle,
} from '../../../lib/types';
import EstadoBadge from '../../../components/EstadoBadge';
import SignaturePad, { SignaturePadRef } from '../../../components/SignaturePad';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  correctivo:  'Correctivo',
  preventivo:  'Preventivo',
  instalacion: 'Instalación',
};

type Transicion = { label: string; estado: EstadoOT };

const TRANSICIONES: Record<EstadoOT, Transicion[]> = {
  borrador:           [],
  asignada:           [{ label: 'Iniciar trabajo', estado: 'en_curso' }],
  en_curso:           [
    { label: 'Suspender — falta repuesto', estado: 'pendiente_repuesto' },
    { label: 'Cerrar OT', estado: 'cerrada' },
  ],
  pendiente_repuesto: [{ label: 'Retomar trabajo', estado: 'en_curso' }],
  cerrada:            [],
  cancelada:          [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFecha(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function nombreCliente(c: OTClienteDetalle): string {
  if (c.razon_social) return c.razon_social;
  return [c.nombre, c.apellido].filter(Boolean).join(' ') || '—';
}

function clienteTelefono(c: OTClienteDetalle): string | null {
  const ct = c.contactos?.[0];
  return ct?.whatsapp ?? ct?.telefono ?? null;
}

function clienteEmail(c: OTClienteDetalle): string | null {
  return c.contactos?.[0]?.email ?? null;
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function OTDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ot, setOt]             = useState<OrdenTrabajo | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // Diagnóstico / trabajo realizado editables
  const [diagnostico, setDiagnostico]         = useState('');
  const [trabajoRealizado, setTrabajoRealizado] = useState('');
  const [editDirty, setEditDirty]               = useState(false);

  // Modal cambio de estado
  const [modalVisible, setModalVisible] = useState(false);
  const [transicion, setTransicion]     = useState<Transicion | null>(null);
  const [notasEstado, setNotasEstado]   = useState('');
  const [firmadoPor, setFirmadoPor]     = useState('');

  // Firma
  const [firmaVisible, setFirmaVisible] = useState(false);
  const sigRef = useRef<SignaturePadRef>(null);

  const fetchOt = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: OrdenTrabajo }>(`/ots/${id}`);
      setOt(data.data);
      setDiagnostico(data.data.diagnostico ?? '');
      setTrabajoRealizado(data.data.trabajo_realizado ?? '');
      setEditDirty(false);
    } catch {
      Alert.alert('Error', 'No se pudo cargar la orden');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOt(); }, [fetchOt]);

  // ── Guardar diagnóstico / trabajo realizado ────────────────────────────────
  async function handleGuardarDiagnostico() {
    setSaving(true);
    try {
      await api.patch(`/ots/${id}`, { diagnostico, trabajo_realizado: trabajoRealizado });
      setEditDirty(false);
      await fetchOt();
    } catch {
      Alert.alert('Error', 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  // ── Cambio de estado ───────────────────────────────────────────────────────
  function abrirModalEstado(t: Transicion) {
    setTransicion(t);
    setNotasEstado('');
    setFirmadoPor('');
    setModalVisible(true);
  }

  async function confirmarCambioEstado() {
    if (!transicion) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {
        estado: transicion.estado,
        notas:  notasEstado,
      };
      if (transicion.estado === 'cerrada') {
        body.trabajo_realizado = trabajoRealizado;
        body.firmado_por       = firmadoPor;
        body.firma_cliente     = 'app-tecnico-pending';
      }
      await api.patch(`/ots/${id}/estado`, body);
      setModalVisible(false);
      await fetchOt();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.message || 'No se pudo cambiar el estado');
    } finally {
      setSaving(false);
    }
  }

  // ── Checklist ─────────────────────────────────────────────────────────────
  async function toggleTarea(checklistId: string, tareaId: string, completada: boolean) {
    const accion = completada ? 'descompletar' : 'completar';
    try {
      await api.post(`/ots/${id}/checklists/${checklistId}/tareas/${tareaId}/${accion}`);
      await fetchOt();
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la tarea');
    }
  }

  // ── Fotos ──────────────────────────────────────────────────────────────────
  async function handleAgregarFoto() {
    Alert.alert('Agregar foto', '¿Desde dónde?', [
      {
        text: 'Cámara',
        onPress: () => pickFoto('camera'),
      },
      {
        text: 'Galería',
        onPress: () => pickFoto('library'),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function pickFoto(source: 'camera' | 'library') {
    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Habilitá el acceso a la cámara en ajustes.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Habilitá el acceso a la galería en ajustes.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
    }

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const compressed = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    const form = new FormData();
    form.append('foto', {
      uri: compressed.uri,
      name: `foto_${Date.now()}.jpg`,
      type: 'image/jpeg',
    } as any);

    setSaving(true);
    try {
      await api.post(`/ots/${id}/fotos`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await fetchOt();
    } catch {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setSaving(false);
    }
  }

  // ── Firma ─────────────────────────────────────────────────────────────────
  async function handleGuardarFirma() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      Alert.alert('Firma vacía', 'Dibujá la firma antes de confirmar');
      return;
    }
    const dataURL = sigRef.current.toDataURL();
    setSaving(true);
    try {
      await api.patch(`/ots/${id}/firma`, { firma_cliente: dataURL, firmado_por: firmadoPor });
      setFirmaVisible(false);
      await fetchOt();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la firma');
    } finally {
      setSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading || !ot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
      </View>
    );
  }

  const transiciones = TRANSICIONES[ot.estado] ?? [];
  const puedeEditar  = ['borrador', 'asignada', 'en_curso', 'pendiente_repuesto'].includes(ot.estado);
  const necesitaFirma = ot.estado === 'cerrada' && !ot.firma_cliente;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── 1. Info general ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información general</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Orden</Text>
            <Text style={styles.infoValue}>#{ot.numero}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tipo</Text>
            <Text style={styles.infoValue}>{TIPO_LABEL[ot.tipo] ?? ot.tipo}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Fecha</Text>
            <Text style={styles.infoValue}>
              {formatFecha(ot.fecha_programada)}
              {ot.hora_programada ? ` ${ot.hora_programada.slice(0, 5)}` : ''}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Descripción</Text>
            <Text style={[styles.infoValue, { flex: 1 }]}>{ot.descripcion}</Text>
          </View>
          {ot.notas_internas ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Notas</Text>
              <Text style={[styles.infoValue, { flex: 1 }]}>{ot.notas_internas}</Text>
            </View>
          ) : null}
        </View>

        {/* ── 2. Cliente ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>

          <Text style={styles.clienteNombre}>{nombreCliente(ot.cliente)}</Text>
          {clienteTelefono(ot.cliente) ? (
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${clienteTelefono(ot.cliente)}`)}>
              <Text style={styles.link}>📞 {clienteTelefono(ot.cliente)}</Text>
            </TouchableOpacity>
          ) : null}
          {clienteEmail(ot.cliente) ? (
            <Text style={styles.infoMuted}>{clienteEmail(ot.cliente)}</Text>
          ) : null}
          {ot.direccion ? (() => {
            const d = ot.direccion;
            const partes = [d.calle, d.numero, d.ciudad, d.provincia].filter(Boolean).join(', ');
            const query  = encodeURIComponent(partes);
            return (
              <TouchableOpacity
                style={{ marginTop: 6 }}
                onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)}
              >
                <Text style={styles.link}>📍 {partes}</Text>
              </TouchableOpacity>
            );
          })() : null}
        </View>

        {/* ── 3. Equipo ───────────────────────────────────────────────── */}
        {ot.equipo ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Equipo</Text>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Marca / Modelo</Text>
              <Text style={styles.infoValue}>
                {ot.equipo.modelo?.marca?.nombre ?? ''} {ot.equipo.modelo?.nombre ?? ''}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tipo</Text>
              <Text style={styles.infoValue}>{ot.equipo.tipo?.nombre ?? '—'}</Text>
            </View>
            {ot.equipo.numero_serie ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>N/S</Text>
                <Text style={styles.infoValue}>{ot.equipo.numero_serie}</Text>
              </View>
            ) : null}
            {ot.equipo.espacio ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Ubicación</Text>
                <Text style={[styles.infoValue, { flex: 1 }]}>{ot.equipo.espacio}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── 4. Estado ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado</Text>

          <View style={{ marginBottom: 12 }}>
            <EstadoBadge estado={ot.estado} />
          </View>

          {transiciones.length > 0 && (
            <View style={styles.transicionesRow}>
              {transiciones.map((t) => (
                <TouchableOpacity
                  key={t.estado}
                  style={[
                    styles.transicionBtn,
                    t.estado === 'cerrada' && styles.transicionBtnCerrar,
                    t.estado === 'pendiente_repuesto' && styles.transicionBtnSuspender,
                  ]}
                  onPress={() => abrirModalEstado(t)}
                >
                  <Text style={styles.transicionBtnText}>{t.label.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ── 5. Diagnóstico / trabajo realizado ──────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnóstico y trabajo</Text>

          <Text style={styles.fieldLabel}>Diagnóstico</Text>
          <TextInput
            style={[styles.textarea, !puedeEditar && styles.textareaDisabled]}
            value={diagnostico}
            onChangeText={(v) => { setDiagnostico(v); setEditDirty(true); }}
            placeholder="Descripción del problema encontrado..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={4}
            editable={puedeEditar}
          />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Trabajo realizado</Text>
          <TextInput
            style={[styles.textarea, !puedeEditar && styles.textareaDisabled]}
            value={trabajoRealizado}
            onChangeText={(v) => { setTrabajoRealizado(v); setEditDirty(true); }}
            placeholder="Descripción del trabajo ejecutado..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={4}
            editable={puedeEditar}
          />

          {editDirty && puedeEditar && (
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleGuardarDiagnostico}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>GUARDAR CAMBIOS</Text>}
            </TouchableOpacity>
          )}
        </View>

        {/* ── 6. Items / Repuestos ────────────────────────────────────── */}
        {ot.items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Repuestos / Materiales</Text>
            {ot.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre}>{item.producto.nombre}</Text>
                  {item.producto.codigo && (
                    <Text style={styles.itemCodigo}>COD: {item.producto.codigo}</Text>
                  )}
                  {item.notas && <Text style={styles.itemNotas}>{item.notas}</Text>}
                </View>
                <Text style={styles.itemCantidad}>×{item.cantidad}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 7. Checklist ────────────────────────────────────────────── */}
        {ot.checklist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {ot.checklist.map((cl) => (
              <ChecklistSection
                key={cl.id}
                checklist={cl}
                otId={id}
                canToggle={puedeEditar}
                onToggle={toggleTarea}
              />
            ))}
          </View>
        )}

        {/* ── 8a. Fotos ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fotos</Text>

          {ot.fotos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotoScroll}>
              {ot.fotos.map((foto) => {
                const url = buildFileUrl(foto.url);
                return url ? (
                  <TouchableOpacity key={foto.id} onPress={() => Linking.openURL(url)}>
                    <Image source={{ uri: url }} style={styles.fotoThumb} />
                  </TouchableOpacity>
                ) : null;
              })}
            </ScrollView>
          )}

          {puedeEditar && (
            <TouchableOpacity
              style={[styles.secondaryBtn, saving && styles.saveBtnDisabled]}
              onPress={handleAgregarFoto}
              disabled={saving}
            >
              <Text style={styles.secondaryBtnText}>📷 AGREGAR FOTO</Text>
            </TouchableOpacity>
          )}

          {ot.fotos.length === 0 && !puedeEditar && (
            <Text style={styles.emptyText}>Sin fotos</Text>
          )}
        </View>

        {/* ── 8b. Firma ───────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Firma del cliente</Text>

          {ot.firma_cliente && ot.firma_cliente !== 'app-tecnico-pending' ? (
            ot.firma_cliente.startsWith('data:image') ? (
              <Image
                source={{ uri: ot.firma_cliente }}
                style={styles.firmaImg}
                resizeMode="contain"
              />
            ) : (
              <View style={styles.firmaWebBox}>
                <Text style={styles.firmaWebText}>✓ Cerrado desde administración</Text>
              </View>
            )
          ) : ot.estado === 'cerrada' && necesitaFirma ? (
            <TouchableOpacity
              style={styles.firmaBtn}
              onPress={() => setFirmaVisible(true)}
            >
              <Text style={styles.firmaBtnText}>✏️ CAPTURAR FIRMA</Text>
            </TouchableOpacity>
          ) : ot.estado !== 'cerrada' ? (
            <Text style={styles.emptyText}>Disponible al cerrar la OT</Text>
          ) : null}

          {ot.firmado_por && (
            <Text style={styles.firmadoPor}>Firmado por: {ot.firmado_por}</Text>
          )}
        </View>

        {/* ── Historial ────────────────────────────────────────────────── */}
        {ot.historial.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Historial</Text>
            {ot.historial.map((h) => (
              <View key={h.id} style={styles.historialItem}>
                <View style={styles.historialHeader}>
                  <EstadoBadge estado={h.estado_hasta} />
                  <Text style={styles.historialFecha}>
                    {new Date(h.creado_en).toLocaleDateString('es-AR')}
                  </Text>
                </View>
                {h.notas ? <Text style={styles.historialNotas}>{h.notas}</Text> : null}
              </View>
            ))}
          </View>
        )}

      </ScrollView>

      {/* ─── Modal cambio de estado ────────────────────────────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {transicion?.label ?? 'Cambiar estado'}
            </Text>

            {transicion?.estado === 'cerrada' && (
              <>
                <Text style={styles.fieldLabel}>Trabajo realizado *</Text>
                <TextInput
                  style={[styles.textarea, { marginBottom: 12 }]}
                  value={trabajoRealizado}
                  onChangeText={setTrabajoRealizado}
                  placeholder="Descripción del trabajo..."
                  placeholderTextColor="#555"
                  multiline
                  numberOfLines={3}
                />
                <Text style={styles.fieldLabel}>Firmado por (nombre cliente)</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 12 }]}
                  value={firmadoPor}
                  onChangeText={setFirmadoPor}
                  placeholder="Nombre del cliente"
                  placeholderTextColor="#555"
                />
              </>
            )}

            <Text style={styles.fieldLabel}>Notas (opcional)</Text>
            <TextInput
              style={[styles.textarea, { marginBottom: 16 }]}
              value={notasEstado}
              onChangeText={setNotasEstado}
              placeholder="Observaciones sobre el cambio..."
              placeholderTextColor="#555"
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, saving && styles.saveBtnDisabled]}
                onPress={confirmarCambioEstado}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>CONFIRMAR</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── Modal firma ───────────────────────────────────────────── */}
      <Modal visible={firmaVisible} animationType="slide">
        <View style={styles.firmaModal}>
          <View style={styles.firmaModalHeader}>
            <Text style={styles.firmaModalTitle}>Firma del cliente</Text>
            <TouchableOpacity onPress={() => setFirmaVisible(false)}>
              <Text style={styles.firmaModalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { paddingHorizontal: 16, marginBottom: 8 }]}>
            Firmado por
          </Text>
          <TextInput
            style={[styles.input, { marginHorizontal: 16, marginBottom: 12 }]}
            value={firmadoPor}
            onChangeText={setFirmadoPor}
            placeholder="Nombre del cliente"
            placeholderTextColor="#555"
          />

          <View style={styles.firmaCanvas}>
            <SignaturePad ref={sigRef} />
          </View>
          <Text style={styles.firmaHint}>Dibuje la firma en el área blanca</Text>

          <View style={styles.firmaActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => sigRef.current?.clear()}
            >
              <Text style={styles.cancelBtnText}>BORRAR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, saving && styles.saveBtnDisabled]}
              onPress={handleGuardarFirma}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.confirmBtnText}>GUARDAR FIRMA</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Sub-componente ChecklistSection ──────────────────────────────────────────
interface ChecklistSectionProps {
  checklist: OTChecklist;
  otId: string;
  canToggle: boolean;
  onToggle: (clId: string, tId: string, completada: boolean) => void;
}

function ChecklistSection({ checklist, otId, canToggle, onToggle }: ChecklistSectionProps) {
  const completadas = checklist.tareas.filter((t) => t.completada).length;
  return (
    <View style={styles.checklistContainer}>
      <View style={styles.checklistHeader}>
        <Text style={styles.checklistNombre}>{checklist.plantilla_nombre}</Text>
        <Text style={styles.checklistProgress}>
          {completadas}/{checklist.tareas.length}
        </Text>
      </View>
      {checklist.tareas
        .sort((a, b) => a.orden - b.orden)
        .map((tarea) => (
          <TouchableOpacity
            key={tarea.id}
            style={styles.tareaRow}
            onPress={() => canToggle && onToggle(checklist.id, tarea.id, tarea.completada)}
            activeOpacity={canToggle ? 0.6 : 1}
          >
            <View style={[styles.tareaCheck, tarea.completada && styles.tareaCheckDone]}>
              {tarea.completada && <Text style={styles.tareaCheckMark}>✓</Text>}
            </View>
            <Text style={[styles.tareaDesc, tarea.completada && styles.tareaDescDone]}>
              {tarea.nombre}
            </Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  content: {
    padding: 12,
    gap: 12,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0A',
  },

  // Secciones
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

  // Info rows
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 12,
    color: '#888888',
    width: 90,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    color: '#F5F5F5',
    fontWeight: '500',
  },
  infoMuted: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },

  // Cliente
  clienteNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F5F5F5',
    marginBottom: 6,
  },
  link: {
    fontSize: 14,
    color: '#4A9EE8',
    marginTop: 4,
  },

  // Estado / transiciones
  transicionesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  transicionBtn: {
    backgroundColor: '#E8500A',
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  transicionBtnCerrar: {
    backgroundColor: '#1A6E3A',
  },
  transicionBtnSuspender: {
    backgroundColor: '#7A5A00',
  },
  transicionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Campos editables
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  textarea: {
    borderWidth: 1,
    borderColor: '#1F1F1F',
    borderRadius: 4,
    padding: 12,
    fontSize: 14,
    color: '#F5F5F5',
    backgroundColor: 'rgba(255,255,255,0.04)',
    textAlignVertical: 'top',
    minHeight: 90,
  },
  textareaDisabled: {
    opacity: 0.6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#1F1F1F',
    borderRadius: 4,
    padding: 12,
    fontSize: 14,
    color: '#F5F5F5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  // Botones
  saveBtn: {
    backgroundColor: '#E8500A',
    borderRadius: 4,
    padding: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#E8500A',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {
    color: '#E8500A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  emptyText: {
    color: '#555555',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
    gap: 8,
  },
  itemNombre: {
    fontSize: 14,
    color: '#F5F5F5',
    fontWeight: '500',
  },
  itemCodigo: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
  },
  itemNotas: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
    fontStyle: 'italic',
  },
  itemCantidad: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E8500A',
    minWidth: 30,
    textAlign: 'right',
  },

  // Checklist
  checklistContainer: {
    marginBottom: 12,
  },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checklistNombre: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F5F5',
  },
  checklistProgress: {
    fontSize: 12,
    color: '#888888',
  },
  tareaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  tareaCheck: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#555555',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  tareaCheckDone: {
    backgroundColor: '#E8500A',
    borderColor: '#E8500A',
  },
  tareaCheckMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  tareaDesc: {
    fontSize: 14,
    color: '#F5F5F5',
    flex: 1,
    lineHeight: 20,
  },
  tareaDescDone: {
    color: '#555555',
    textDecorationLine: 'line-through',
  },

  // Fotos
  fotoScroll: {
    marginBottom: 10,
  },
  fotoThumb: {
    width: 100,
    height: 100,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },

  // Firma
  firmaImg: {
    width: '100%',
    height: 120,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    backgroundColor: '#fff',
  },
  firmaWebBox: {
    backgroundColor: '#0D2D1A',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
  },
  firmaWebText: {
    color: '#2ECC71',
    fontSize: 14,
    fontWeight: '600',
  },
  firmaBtn: {
    borderWidth: 1,
    borderColor: '#E8500A',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
  },
  firmaBtnText: {
    color: '#E8500A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  firmadoPor: {
    fontSize: 12,
    color: '#666666',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Historial
  historialItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
    gap: 4,
  },
  historialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historialFecha: {
    fontSize: 12,
    color: '#666666',
  },
  historialNotas: {
    fontSize: 13,
    color: '#888888',
    fontStyle: 'italic',
  },
  historialUsuario: {
    fontSize: 12,
    color: '#555555',
  },

  // Modal estado
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5F5F5',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    borderRadius: 4,
    padding: 13,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#E8500A',
    borderRadius: 4,
    padding: 13,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Modal firma
  firmaModal: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  firmaModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  firmaModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F5F5F5',
  },
  firmaModalClose: {
    fontSize: 18,
    color: '#888888',
    padding: 4,
  },
  firmaCanvas: {
    flex: 1,
    margin: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1F1F1F',
  },
  firmaHint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#555555',
    marginBottom: 12,
  },
  firmaActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
});
