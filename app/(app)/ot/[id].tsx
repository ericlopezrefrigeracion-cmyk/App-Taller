import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
import { getUser } from '../../../lib/auth';
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

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface ProductoBusqueda {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  unidad: string;
}

interface EquipoBusqueda {
  id: string;
  codigo_interno: string;
  espacio: string | null;
  tipo: { nombre: string } | null;
  modelo: { nombre: string; marca: { nombre: string } } | null;
}

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

const NOTA_SEP = '\n---\n';

function parseNotas(raw: string | null): { fecha: string; autor: string; texto: string }[] {
  if (!raw) return [];
  return raw.split(NOTA_SEP).map(n => {
    const match = n.match(/^\[(.+?)\] ([\s\S]*)$/);
    if (match) {
      const header = match[1]; // "DD/MM/YYYY HH:MM | Nombre" o solo "DD/MM/YYYY HH:MM"
      const sep = header.indexOf(' | ');
      if (sep !== -1) return { fecha: header.slice(0, sep), autor: header.slice(sep + 3), texto: match[2] };
      return { fecha: header, autor: '', texto: match[2] };
    }
    return { fecha: '', autor: '', texto: n };
  });
}

function fmtNow(): string {
  return new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

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

  // Modal cambio de estado (para transiciones que NO son cerrar)
  const [modalVisible, setModalVisible] = useState(false);
  const [transicion, setTransicion]     = useState<Transicion | null>(null);
  const [notasEstado, setNotasEstado]   = useState('');
  const [firmadoPor, setFirmadoPor]     = useState('');

  // Notas internas
  const [nuevaNota,    setNuevaNota]    = useState('');
  const [savingNota,   setSavingNota]   = useState(false);

  // Firma (y cierre integrado)
  const [firmaVisible, setFirmaVisible] = useState(false);
  const [cerrando,     setCerrando]     = useState(false);
  const [notasCierre,  setNotasCierre]  = useState('');
  const sigRef = useRef<SignaturePadRef>(null);

  // Modal asignar equipo
  const [equipoModalVisible,   setEquipoModalVisible]   = useState(false);
  const [busquedaEquipo,       setBusquedaEquipo]       = useState('');
  const [resultadosEquipo,     setResultadosEquipo]     = useState<EquipoBusqueda[]>([]);
  const [buscandoEquipo,       setBuscandoEquipo]       = useState(false);
  const [asignandoEquipo,      setAsignandoEquipo]      = useState(false);
  const equipoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modal agregar item
  const [itemModalVisible,    setItemModalVisible]    = useState(false);
  const [busquedaProducto,    setBusquedaProducto]    = useState('');
  const [resultadosProducto,  setResultadosProducto]  = useState<ProductoBusqueda[]>([]);
  const [buscandoProducto,    setBuscandoProducto]    = useState(false);
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoBusqueda | null>(null);
  const [cantidadItem,        setCantidadItem]        = useState('1');
  const [notasItem,           setNotasItem]           = useState('');
  const [guardandoItem,       setGuardandoItem]       = useState(false);
  const busquedaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Equipo ─────────────────────────────────────────────────────────────────

  function handleBusquedaEquipoChange(text: string) {
    setBusquedaEquipo(text);
    if (equipoTimer.current) clearTimeout(equipoTimer.current);
    if (!text.trim()) { setResultadosEquipo([]); return; }
    equipoTimer.current = setTimeout(async () => {
      setBuscandoEquipo(true);
      try {
        const clienteId = ot?.cliente?.id ? `&cliente_id=${ot.cliente.id}` : '';
        const { data } = await api.get(`/equipos?q=${encodeURIComponent(text)}&limit=20${clienteId}`);
        setResultadosEquipo(data.data?.items ?? []);
      } catch { setResultadosEquipo([]); }
      finally { setBuscandoEquipo(false); }
    }, 350);
  }

  function abrirModalEquipo() {
    setBusquedaEquipo('');
    setResultadosEquipo([]);
    setEquipoModalVisible(true);
  }

  async function asignarEquipo(equipo: EquipoBusqueda) {
    setAsignandoEquipo(true);
    try {
      await api.patch(`/ots/${id}`, { equipo_id: equipo.id });
      setEquipoModalVisible(false);
      await fetchOt();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error ?? 'No se pudo asignar el equipo');
    } finally { setAsignandoEquipo(false); }
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  function handleBusquedaChange(text: string) {
    setBusquedaProducto(text);
    setProductoSeleccionado(null);
    if (busquedaTimer.current) clearTimeout(busquedaTimer.current);
    if (!text.trim()) { setResultadosProducto([]); return; }
    busquedaTimer.current = setTimeout(async () => {
      setBuscandoProducto(true);
      try {
        const { data } = await api.get(`/productos?q=${encodeURIComponent(text)}&limit=20`);
        setResultadosProducto(data.data ?? []);
      } catch { setResultadosProducto([]); }
      finally { setBuscandoProducto(false); }
    }, 350);
  }

  function abrirModalItem() {
    setBusquedaProducto('');
    setResultadosProducto([]);
    setProductoSeleccionado(null);
    setCantidadItem('1');
    setNotasItem('');
    setItemModalVisible(true);
  }

  async function confirmarAgregarItem() {
    if (!productoSeleccionado) return;
    const qty = parseInt(cantidadItem, 10);
    if (isNaN(qty) || qty < 1) {
      Alert.alert('Cantidad inválida', 'Ingresá una cantidad mayor a 0.');
      return;
    }
    setGuardandoItem(true);
    try {
      await api.post(`/ots/${id}/items`, {
        producto_id: productoSeleccionado.id,
        cantidad:    qty,
        notas:       notasItem.trim() || null,
      });
      setItemModalVisible(false);
      await fetchOt();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error ?? 'No se pudo agregar el artículo');
    } finally { setGuardandoItem(false); }
  }

  async function eliminarItem(itemId: string) {
    Alert.alert('Eliminar artículo', '¿Querés eliminar este artículo de la OT?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/ots/${id}/items/${itemId}`);
            await fetchOt();
          } catch {
            Alert.alert('Error', 'No se pudo eliminar el artículo');
          }
        },
      },
    ]);
  }

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

  // ── Notas internas ────────────────────────────────────────────────────────
  async function handleAgregarNota() {
    const texto = nuevaNota.trim();
    if (!texto || !ot) return;
    setSavingNota(true);
    try {
      const user = await getUser();
      const autorNombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || '';
      const header = autorNombre ? `${fmtNow()} | ${autorNombre}` : fmtNow();
      const nueva = `[${header}] ${texto}`;
      const acumulada = ot.notas_internas ? `${ot.notas_internas}${NOTA_SEP}${nueva}` : nueva;
      await api.patch(`/ots/${id}`, { notas_internas: acumulada });
      setNuevaNota('');
      await fetchOt();
    } catch {
      Alert.alert('Error', 'No se pudo guardar la nota');
    } finally {
      setSavingNota(false);
    }
  }

  // ── Cambio de estado ───────────────────────────────────────────────────────
  function abrirModalEstado(t: Transicion) {
    if (!ot) return;

    if (t.estado === 'cerrada') {
      // Validar cliente, equipo y fecha completos
      if (!ot.cliente) {
        Alert.alert('Cliente requerido', 'La OT debe tener un cliente asignado antes de cerrar.');
        return;
      }
      if (!ot.equipo) {
        Alert.alert('Equipo requerido', 'La OT debe tener un equipo asignado antes de cerrar.');
        return;
      }
      if (!ot.fecha_programada) {
        Alert.alert('Fecha requerida', 'La OT debe tener una fecha programada antes de cerrar.');
        return;
      }
      // Validar al menos 2 fotos
      if (ot.fotos.length < 2) {
        Alert.alert(
          'Fotos insuficientes',
          `Se necesitan al menos 2 fotos para cerrar la OT.\nActualmente hay ${ot.fotos.length}.`,
        );
        return;
      }
      // Validar tareas obligatorias completadas
      const pendientes = ot.checklist
        .flatMap(cl => cl.tareas)
        .filter(tarea => tarea.obligatoria && !tarea.completada);
      if (pendientes.length > 0) {
        Alert.alert(
          'Tareas obligatorias pendientes',
          `Completá las ${pendientes.length} tarea(s) obligatoria(s) antes de cerrar la OT.`,
        );
        return;
      }
      // Abrir flujo de cierre con firma integrada
      setCerrando(true);
      setFirmadoPor('');
      setNotasCierre('');
      setFirmaVisible(true);
      return;
    }

    // Resto de transiciones (suspender, retomar, etc.)
    setTransicion(t);
    setNotasEstado('');
    setModalVisible(true);
  }

  async function confirmarCambioEstado() {
    if (!transicion) return;
    setSaving(true);
    try {
      await api.patch(`/ots/${id}/estado`, {
        estado: transicion.estado,
        notas:  notasEstado,
      });
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

  // ── Firma (también maneja el cierre de OT con firma integrada) ───────────
  async function handleGuardarFirma() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      Alert.alert('Firma vacía', 'El cliente debe firmar antes de confirmar.');
      return;
    }
    if (cerrando && !trabajoRealizado.trim()) {
      Alert.alert('Campo requerido', 'Completá la descripción del trabajo realizado.');
      return;
    }
    const dataURL = sigRef.current.toDataURL();
    setSaving(true);
    try {
      if (cerrando) {
        // 1. Cambiar estado a cerrada
        await api.patch(`/ots/${id}/estado`, {
          estado:            'cerrada',
          trabajo_realizado: trabajoRealizado,
          notas:             notasCierre,
          firmado_por:       firmadoPor,
        });
        // 2. Guardar firma del cliente
        await api.patch(`/ots/${id}/firma`, { firma_cliente: dataURL, firmado_por: firmadoPor });
        setCerrando(false);
      } else {
        await api.patch(`/ots/${id}/firma`, { firma_cliente: dataURL, firmado_por: firmadoPor });
      }
      setFirmaVisible(false);
      await fetchOt();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error ?? e.response?.data?.message ?? 'No se pudo guardar');
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
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Equipo</Text>
            {puedeEditar && (
              <TouchableOpacity onPress={abrirModalEquipo} style={styles.addItemBtn}>
                <Text style={styles.addItemBtnText}>{ot.equipo ? 'Cambiar' : '+ Asignar'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {ot.equipo ? (
            <>
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
            </>
          ) : (
            <Text style={styles.emptyText}>Sin equipo asignado</Text>
          )}
        </View>

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

        {/* ── 6. Notas internas ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notas internas</Text>

          {parseNotas(ot.notas_internas).map((n, i) => (
            <View key={i} style={styles.notaItem}>
              {(n.fecha || n.autor) ? (
                <View style={styles.notaHeader}>
                  {n.fecha ? <Text style={styles.notaFecha}>{n.fecha}</Text> : null}
                  {n.autor ? <Text style={styles.notaAutor}>{n.autor}</Text> : null}
                </View>
              ) : null}
              <Text style={styles.notaTexto}>{n.texto}</Text>
            </View>
          ))}

          {!ot.notas_internas && (
            <Text style={styles.emptyText}>Sin notas</Text>
          )}

          {puedeEditar && (
            <View style={{ marginTop: 12 }}>
              <TextInput
                style={[styles.textarea, { minHeight: 70 }]}
                value={nuevaNota}
                onChangeText={setNuevaNota}
                placeholder="Nueva nota..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity
                style={[styles.secondaryBtn, (!nuevaNota.trim() || savingNota) && styles.saveBtnDisabled, { marginTop: 8 }]}
                onPress={handleAgregarNota}
                disabled={!nuevaNota.trim() || savingNota}
              >
                {savingNota
                  ? <ActivityIndicator color="#E8500A" size="small" />
                  : <Text style={styles.secondaryBtnText}>+ AGREGAR NOTA</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── 7. Items / Repuestos ────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Repuestos / Materiales</Text>
            {puedeEditar && (
              <TouchableOpacity onPress={abrirModalItem} style={styles.addItemBtn}>
                <Text style={styles.addItemBtnText}>+ Agregar</Text>
              </TouchableOpacity>
            )}
          </View>
          {ot.items.length === 0 ? (
            <Text style={styles.emptyText}>Sin artículos cargados</Text>
          ) : (
            ot.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNombre}>{item.producto.nombre}</Text>
                  {item.producto.codigo && (
                    <Text style={styles.itemCodigo}>COD: {item.producto.codigo}</Text>
                  )}
                  {item.notas && <Text style={styles.itemNotas}>{item.notas}</Text>}
                </View>
                <Text style={styles.itemCantidad}>×{item.cantidad}</Text>
                {puedeEditar && (
                  <TouchableOpacity onPress={() => eliminarItem(item.id)} style={styles.itemDeleteBtn}>
                    <Text style={styles.itemDeleteBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>

        {/* ── 7. Checklist ────────────────────────────────────────────── */}
        {(() => {
          const oblPendientes = ot.checklist
            .flatMap(cl => cl.tareas)
            .filter(t => t.obligatoria && !t.completada).length;
          return (
            <View style={styles.section}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Checklist de tareas</Text>
                {oblPendientes > 0 && (
                  <View style={styles.obligBadge}>
                    <Text style={styles.obligBadgeText}>⚠ {oblPendientes} OBLIG.</Text>
                  </View>
                )}
              </View>
              {ot.checklist.length === 0 ? (
                <Text style={styles.emptyText}>Sin tareas asignadas en esta OT</Text>
              ) : (
                ot.checklist.map((cl) => (
                  <ChecklistSection
                    key={cl.id}
                    checklist={cl}
                    otId={id}
                    canToggle={puedeEditar}
                    onToggle={toggleTarea}
                  />
                ))
              )}
            </View>
          );
        })()}

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

      {/* ─── Modal asignar equipo ──────────────────────────────────── */}
      <Modal visible={equipoModalVisible} transparent animationType="slide" onRequestClose={() => setEquipoModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: '85%' }]}>
              <Text style={styles.modalTitle}>
                {ot?.equipo ? 'Cambiar equipo' : 'Asignar equipo'}
              </Text>
              <Text style={{ color: '#666', fontSize: 12, marginBottom: 10 }}>
                {ot?.cliente ? `Mostrando equipos de ${ot.cliente.razon_social ?? [ot.cliente.nombre, ot.cliente.apellido].filter(Boolean).join(' ')}` : 'Buscá por código, N/S o ubicación'}
              </Text>

              <TextInput
                style={styles.input}
                value={busquedaEquipo}
                onChangeText={handleBusquedaEquipoChange}
                placeholder="Buscar equipo…"
                placeholderTextColor="#555"
                autoFocus
              />

              {buscandoEquipo && <ActivityIndicator color="#E8500A" style={{ marginVertical: 8 }} />}
              {!buscandoEquipo && resultadosEquipo.length === 0 && busquedaEquipo.trim().length > 1 && (
                <Text style={{ color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 8 }}>Sin resultados</Text>
              )}

              <FlatList
                data={resultadosEquipo}
                keyExtractor={e => e.id}
                style={{ maxHeight: 300 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: eq }) => (
                  <TouchableOpacity
                    style={[styles.productoResultRow, asignandoEquipo && { opacity: 0.5 }]}
                    onPress={() => asignarEquipo(eq)}
                    disabled={asignandoEquipo}
                  >
                    <Text style={styles.productoResultNombre}>
                      {eq.modelo ? `${eq.modelo.marca.nombre} ${eq.modelo.nombre}` : eq.codigo_interno}
                    </Text>
                    <Text style={styles.productoResultMeta}>
                      {[eq.tipo?.nombre, eq.espacio, eq.codigo_interno].filter(Boolean).join(' · ')}
                    </Text>
                  </TouchableOpacity>
                )}
              />

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEquipoModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>CANCELAR</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Modal agregar artículo ────────────────────────────────── */}
      <Modal visible={itemModalVisible} transparent animationType="slide" onRequestClose={() => setItemModalVisible(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { maxHeight: '85%' }]}>
              <Text style={styles.modalTitle}>Agregar artículo / servicio</Text>

              {productoSeleccionado ? (
                /* ── Paso 2: producto elegido ── */
                <View>
                  <View style={styles.productoSelectedBox}>
                    <Text style={styles.productoSelectedNombre}>{productoSeleccionado.nombre}</Text>
                    {productoSeleccionado.codigo && (
                      <Text style={styles.itemCodigo}>COD: {productoSeleccionado.codigo}</Text>
                    )}
                    <TouchableOpacity onPress={() => setProductoSeleccionado(null)} style={{ marginTop: 6 }}>
                      <Text style={{ color: '#888', fontSize: 12 }}>Cambiar producto</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.inputLabel}>Cantidad</Text>
                  <TextInput
                    style={styles.input}
                    value={cantidadItem}
                    onChangeText={setCantidadItem}
                    keyboardType="numeric"
                    placeholder="1"
                    placeholderTextColor="#555"
                  />

                  <Text style={styles.inputLabel}>Notas (opcional)</Text>
                  <TextInput
                    style={[styles.input, { minHeight: 60 }]}
                    value={notasItem}
                    onChangeText={setNotasItem}
                    placeholder="Ej: reemplazado por garantía"
                    placeholderTextColor="#555"
                    multiline
                  />
                </View>
              ) : (
                /* ── Paso 1: buscar producto ── */
                <View>
                  <TextInput
                    style={styles.input}
                    value={busquedaProducto}
                    onChangeText={handleBusquedaChange}
                    placeholder="Buscar por nombre o código…"
                    placeholderTextColor="#555"
                    autoFocus
                  />
                  {buscandoProducto && (
                    <ActivityIndicator color="#E8500A" style={{ marginVertical: 8 }} />
                  )}
                  {!buscandoProducto && resultadosProducto.length === 0 && busquedaProducto.trim().length > 1 && (
                    <Text style={{ color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 8 }}>Sin resultados</Text>
                  )}
                  <FlatList
                    data={resultadosProducto}
                    keyExtractor={p => p.id}
                    style={{ maxHeight: 250 }}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item: p }) => (
                      <TouchableOpacity
                        style={styles.productoResultRow}
                        onPress={() => { setProductoSeleccionado(p); setBusquedaProducto(p.nombre); }}
                      >
                        <Text style={styles.productoResultNombre}>{p.nombre}</Text>
                        <Text style={styles.productoResultMeta}>
                          {p.tipo === 'servicio' ? 'Servicio' : 'Producto'}{p.codigo ? ` · ${p.codigo}` : ''}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              <View style={[styles.modalActions, { marginTop: 16 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setItemModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>CANCELAR</Text>
                </TouchableOpacity>
                {productoSeleccionado && (
                  <TouchableOpacity
                    style={[styles.confirmBtn, guardandoItem && { opacity: 0.6 }]}
                    onPress={confirmarAgregarItem}
                    disabled={guardandoItem}
                  >
                    <Text style={styles.confirmBtnText}>{guardandoItem ? 'GUARDANDO…' : 'AGREGAR'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Modal cambio de estado (suspender / retomar) ──────────── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {transicion?.label ?? 'Cambiar estado'}
            </Text>

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

      {/* ─── Modal firma / cierre ──────────────────────────────────── */}
      <Modal visible={firmaVisible} animationType="slide">
        <View style={styles.firmaModal}>
          <View style={styles.firmaModalHeader}>
            <Text style={styles.firmaModalTitle}>
              {cerrando ? 'Cerrar OT — Firma del cliente' : 'Firma del cliente'}
            </Text>
            <TouchableOpacity onPress={() => { setFirmaVisible(false); setCerrando(false); }}>
              <Text style={styles.firmaModalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Campos adicionales solo al cerrar */}
          {cerrando && (
            <>
              <Text style={[styles.fieldLabel, { paddingHorizontal: 16, marginBottom: 6, marginTop: 12 }]}>
                TRABAJO REALIZADO *
              </Text>
              <TextInput
                style={[styles.textarea, { marginHorizontal: 16, marginBottom: 10 }]}
                value={trabajoRealizado}
                onChangeText={v => { setTrabajoRealizado(v); setEditDirty(false); }}
                placeholder="Descripción del trabajo ejecutado..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={3}
              />
              <Text style={[styles.fieldLabel, { paddingHorizontal: 16, marginBottom: 6 }]}>
                NOTAS DE CIERRE (opcional)
              </Text>
              <TextInput
                style={[styles.textarea, { marginHorizontal: 16, marginBottom: 10 }]}
                value={notasCierre}
                onChangeText={setNotasCierre}
                placeholder="Observaciones del cierre..."
                placeholderTextColor="#555"
                multiline
                numberOfLines={2}
              />
            </>
          )}

          <Text style={[styles.fieldLabel, { paddingHorizontal: 16, marginBottom: 8, marginTop: cerrando ? 0 : 12 }]}>
            FIRMADO POR (nombre cliente)
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
          <Text style={styles.firmaHint}>El cliente dibuja su firma en el área blanca</Text>

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
                : <Text style={styles.confirmBtnText}>
                    {cerrando ? 'CERRAR OT' : 'GUARDAR FIRMA'}
                  </Text>}
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
            <View style={{ flex: 1 }}>
              <Text style={[styles.tareaDesc, tarea.completada && styles.tareaDescDone]}>
                {tarea.nombre}
              </Text>
              {tarea.obligatoria && !tarea.completada && (
                <Text style={styles.tareaObligatoria}>OBLIGATORIA</Text>
              )}
            </View>
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

  // Items — botón agregar
  addItemBtn: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E8500A',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addItemBtnText: {
    color: '#E8500A',
    fontSize: 12,
    fontWeight: '700',
  },
  itemDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  itemDeleteBtnText: {
    color: '#666',
    fontSize: 14,
  },

  // Modal agregar item — búsqueda
  productoResultRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
  },
  productoResultNombre: {
    fontSize: 14,
    color: '#F5F5F5',
    fontWeight: '500',
  },
  productoResultMeta: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  productoSelectedBox: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8500A',
  },
  productoSelectedNombre: {
    fontSize: 15,
    color: '#F5F5F5',
    fontWeight: '600',
  },
  inputLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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

  // Notas internas
  notaItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F1F',
    gap: 3,
  },
  notaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notaFecha: {
    fontSize: 11,
    color: '#555555',
  },
  notaAutor: {
    fontSize: 11,
    color: '#E8500A',
    fontWeight: '600',
  },
  notaTexto: {
    fontSize: 14,
    color: '#F5F5F5',
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

  // Checklist — obligatoria
  obligBadge: {
    backgroundColor: '#3D1A00',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  obligBadgeText: {
    color: '#E8500A',
    fontSize: 10,
    fontWeight: '700',
  },
  tareaObligatoria: {
    fontSize: 10,
    color: '#E8500A',
    fontWeight: '600',
    marginTop: 2,
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
