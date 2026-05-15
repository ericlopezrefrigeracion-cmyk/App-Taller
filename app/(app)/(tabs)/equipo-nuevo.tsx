import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import api from '../../../lib/api';

// ─── Tipos locales ────────────────────────────────────────────────────────────

interface Rubro   { id: string; nombre: string; tipos: { id: string; nombre: string }[] }
interface Marca   { id: string; nombre: string; modelos: { id: string; nombre: string }[] }
interface Cliente { id: string; nombre: string | null; apellido: string | null; razon_social: string | null }

function nombreCliente(c: Cliente): string {
  if (c.razon_social) return c.razon_social;
  return [c.nombre, c.apellido].filter(Boolean).join(' ') || '—';
}

function generarCodigo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  return `EQ-${yy}${mm}${dd}-${hh}${mi}`;
}

// ─── Selector con opción "Crear nuevo" ───────────────────────────────────────

interface SelectorProps {
  label:          string;
  placeholder:    string;
  options:        { id: string; nombre: string }[];
  selectedId:     string;
  onSelect:       (id: string) => void;
  disabled?:      boolean;
  createNewLabel?: string;
  onCreateNew?:   (nombre: string) => Promise<{ id: string; nombre: string }>;
}

function Selector({ label, placeholder, options, selectedId, onSelect, disabled, createNewLabel, onCreateNew }: SelectorProps) {
  const [open,       setOpen]       = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [newNombre,  setNewNombre]  = useState('');
  const [saving,     setSaving]     = useState(false);
  const inputRef = useRef<TextInput>(null);

  const selected = options.find((o) => o.id === selectedId);

  function abrirCrear() {
    setCreating(true);
    setNewNombre('');
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function confirmarCrear() {
    const nombre = newNombre.trim();
    if (!nombre) return;
    setSaving(true);
    try {
      const item = await onCreateNew!(nombre);
      onSelect(item.id);
      setOpen(false);
      setCreating(false);
      setNewNombre('');
    } catch (e: any) {
      const msg = e.response?.data?.error ?? 'No se pudo crear';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={selStyles.wrapper}>
      <Text style={selStyles.label}>{label}</Text>
      <TouchableOpacity
        style={[selStyles.btn, disabled && selStyles.btnDisabled]}
        onPress={() => { if (!disabled) { setOpen(!open); setCreating(false); } }}
        activeOpacity={0.7}
      >
        <Text style={[selStyles.btnText, !selected && selStyles.placeholder]}>
          {selected ? selected.nombre : placeholder}
        </Text>
        <Text style={selStyles.arrow}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {open && (
        <View style={selStyles.dropdown}>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 200 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[selStyles.option, opt.id === selectedId && selStyles.optionSelected]}
                onPress={() => { onSelect(opt.id); setOpen(false); setCreating(false); }}
              >
                <Text style={[selStyles.optionText, opt.id === selectedId && selStyles.optionTextSelected]}>
                  {opt.nombre}
                </Text>
              </TouchableOpacity>
            ))}
            {options.length === 0 && (
              <Text style={selStyles.optionEmpty}>Sin opciones</Text>
            )}
          </ScrollView>

          {/* Opción crear nuevo */}
          {onCreateNew && !creating && (
            <TouchableOpacity style={selStyles.crearBtn} onPress={abrirCrear}>
              <Text style={selStyles.crearBtnText}>+ {createNewLabel ?? 'Crear nuevo'}</Text>
            </TouchableOpacity>
          )}

          {onCreateNew && creating && (
            <View style={selStyles.crearForm}>
              <TextInput
                ref={inputRef}
                style={selStyles.crearInput}
                value={newNombre}
                onChangeText={setNewNombre}
                placeholder="Nombre..."
                placeholderTextColor="#555"
                autoCapitalize="words"
                onSubmitEditing={confirmarCrear}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[selStyles.crearConfirm, saving && { opacity: 0.5 }]}
                onPress={confirmarCrear}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={selStyles.crearConfirmText}>✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={selStyles.crearCancelar}
                onPress={() => { setCreating(false); setNewNombre(''); }}
              >
                <Text style={selStyles.crearCancelarText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const selStyles = StyleSheet.create({
  wrapper:      { marginBottom: 16 },
  label:        { fontSize: 11, fontWeight: '600', color: '#888888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  btn:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 4, padding: 12, backgroundColor: 'rgba(255,255,255,0.04)' },
  btnDisabled:  { opacity: 0.4 },
  btnText:      { fontSize: 15, color: '#F5F5F5' },
  placeholder:  { color: '#555555' },
  arrow:        { fontSize: 10, color: '#666666' },
  dropdown:     { borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 4, backgroundColor: '#141414', marginTop: 4 },
  option:       { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  optionSelected:     { backgroundColor: 'rgba(232,80,10,0.1)' },
  optionText:         { fontSize: 14, color: '#F5F5F5' },
  optionTextSelected: { color: '#E8500A', fontWeight: '600' },
  optionEmpty:        { padding: 12, color: '#555555', textAlign: 'center' },
  crearBtn:     { borderTopWidth: 1, borderTopColor: '#2A2A2A', padding: 12 },
  crearBtnText: { fontSize: 13, color: '#E8500A', fontWeight: '600' },
  crearForm:    { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#2A2A2A', padding: 8, gap: 6 },
  crearInput:   { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 4, padding: 8, fontSize: 14, color: '#F5F5F5', backgroundColor: '#1A1A1A' },
  crearConfirm: { backgroundColor: '#E8500A', borderRadius: 4, width: 36, alignItems: 'center', justifyContent: 'center' },
  crearConfirmText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  crearCancelar:    { borderWidth: 1, borderColor: '#333', borderRadius: 4, width: 36, alignItems: 'center', justifyContent: 'center' },
  crearCancelarText: { color: '#888', fontSize: 16 },
});

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function EquipoNuevoScreen() {
  const [rubros,   setRubros]   = useState<Rubro[]>([]);
  const [marcas,   setMarcas]   = useState<Marca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);

  const [clienteId,   setClienteId]   = useState('');
  const [clienteQ,    setClienteQ]    = useState('');
  const [rubroId,     setRubroId]     = useState('');
  const [tipoId,      setTipoId]      = useState('');
  const [marcaId,     setMarcaId]     = useState('');
  const [modeloId,    setModeloId]    = useState('');
  const [codigo,      setCodigo]      = useState(generarCodigo);
  const [numeroSerie, setNumeroSerie] = useState('');
  const [espacio,     setEspacio]     = useState('');
  const [notas,       setNotas]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [buscando,    setBuscando]    = useState(false);
  const [showClientes, setShowClientes] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<{ data: Rubro[] }>('/equipo-catalogo'),
      api.get<{ data: Marca[] }>('/equipo-marcas'),
    ]).then(([cat, mar]) => {
      setRubros(cat.data.data);
      setMarcas(mar.data.data);
    }).catch(() => {
      Alert.alert('Error', 'No se pudo cargar el catálogo');
    }).finally(() => setLoadingCatalogo(false));
  }, []);

  const buscarClientes = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setClientes([]); return; }
    setBuscando(true);
    try {
      const { data } = await api.get<{ data: { items: Cliente[] } }>(`/clientes?q=${encodeURIComponent(q)}&limit=15`);
      setClientes(data.data.items);
    } catch {
      setClientes([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(clienteQ), 400);
    return () => clearTimeout(t);
  }, [clienteQ, buscarClientes]);

  const tiposDelRubro    = rubros.find((r) => r.id === rubroId)?.tipos ?? [];
  const modelosDeLaMarca = marcas.find((m) => m.id === marcaId)?.modelos ?? [];

  function seleccionarCliente(c: Cliente) {
    setClienteId(c.id); setClienteQ(nombreCliente(c));
    setShowClientes(false); setClientes([]);
  }

  function handleRubroChange(id: string) { setRubroId(id); setTipoId(''); }
  function handleMarcaChange(id: string) { setMarcaId(id); setModeloId(''); }

  async function handleCrearMarca(nombre: string): Promise<{ id: string; nombre: string }> {
    const { data } = await api.post<{ data: { id: string; nombre: string } }>('/equipo-marcas', { nombre });
    const nueva = data.data;
    setMarcas(prev => [...prev, { ...nueva, modelos: [] }]);
    setMarcaId(nueva.id);
    setModeloId('');
    return nueva;
  }

  async function handleCrearModelo(nombre: string): Promise<{ id: string; nombre: string }> {
    const { data } = await api.post<{ data: { id: string; nombre: string } }>(`/equipo-marcas/${marcaId}/modelos`, { nombre });
    const nuevo = data.data;
    setMarcas(prev => prev.map(m =>
      m.id === marcaId ? { ...m, modelos: [...m.modelos, nuevo] } : m
    ));
    setModeloId(nuevo.id);
    return nuevo;
  }

  async function handleGuardar() {
    if (!clienteId)      return Alert.alert('Falta dato', 'Seleccioná un cliente');
    if (!tipoId)         return Alert.alert('Falta dato', 'Seleccioná el tipo de equipo');
    if (!modeloId)       return Alert.alert('Falta dato', 'Seleccioná marca y modelo');
    if (!codigo.trim())  return Alert.alert('Falta dato', 'El código interno es requerido');

    setSaving(true);
    try {
      await api.post('/equipos', {
        cliente_id:     clienteId,
        tipo_id:        tipoId,
        modelo_id:      modeloId,
        codigo_interno: codigo.trim(),
        numero_serie:   numeroSerie.trim() || undefined,
        espacio:        espacio.trim()     || undefined,
        notas:          notas.trim()       || undefined,
      });
      Alert.alert('Equipo registrado', 'El equipo fue guardado correctamente', [
        { text: 'OK', onPress: resetForm },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'No se pudo guardar el equipo');
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setClienteId(''); setClienteQ(''); setRubroId(''); setTipoId('');
    setMarcaId(''); setModeloId(''); setCodigo(generarCodigo());
    setNumeroSerie(''); setEspacio(''); setNotas('');
  }

  if (loadingCatalogo) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E8500A" />
        <Text style={styles.loadingText}>Cargando catálogo...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.pageTitle}>Registrar equipo</Text>

      {/* ── Cliente ── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Cliente *</Text>
        {clienteId ? (
          <View style={styles.clienteSelected}>
            <Text style={styles.clienteSelectedNombre}>{clienteQ}</Text>
            <TouchableOpacity onPress={() => { setClienteId(''); setClienteQ(''); }}>
              <Text style={styles.clienteSelectedClear}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.input}
              value={clienteQ}
              onChangeText={(v) => { setClienteQ(v); setShowClientes(true); }}
              placeholder="Buscar por nombre, empresa o CUIT..."
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
            {buscando && <ActivityIndicator size="small" color="#E8500A" style={{ marginTop: 4 }} />}
            {showClientes && clientes.length > 0 && (
              <View style={styles.clienteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 220 }}>
                  {clientes.map((c) => (
                    <TouchableOpacity key={c.id} style={styles.clienteOption} onPress={() => seleccionarCliente(c)}>
                      <Text style={styles.clienteOptionText}>{nombreCliente(c)}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Rubro → Tipo ── */}
      <Selector
        label="Rubro"
        placeholder="Seleccioná un rubro"
        options={rubros}
        selectedId={rubroId}
        onSelect={handleRubroChange}
      />
      <Selector
        label="Tipo de equipo *"
        placeholder={rubroId ? 'Seleccioná el tipo' : 'Primero elegí un rubro'}
        options={tiposDelRubro}
        selectedId={tipoId}
        onSelect={setTipoId}
        disabled={!rubroId}
      />

      {/* ── Marca → Modelo ── */}
      <Selector
        label="Marca"
        placeholder="Seleccioná la marca"
        options={marcas}
        selectedId={marcaId}
        onSelect={handleMarcaChange}
        createNewLabel="Crear nueva marca"
        onCreateNew={handleCrearMarca}
      />
      <Selector
        label="Modelo *"
        placeholder={marcaId ? 'Seleccioná el modelo' : 'Primero elegí una marca'}
        options={modelosDeLaMarca}
        selectedId={modeloId}
        onSelect={setModeloId}
        disabled={!marcaId}
        createNewLabel="Crear nuevo modelo"
        onCreateNew={marcaId ? handleCrearModelo : undefined}
      />

      {/* ── Código interno ── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Código interno *</Text>
        <TextInput
          style={styles.input}
          value={codigo}
          onChangeText={setCodigo}
          placeholder="EQ-XXXXXX"
          placeholderTextColor="#555"
          autoCapitalize="characters"
        />
      </View>

      {/* ── N° de serie ── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>N° de serie</Text>
        <TextInput
          style={styles.input}
          value={numeroSerie}
          onChangeText={setNumeroSerie}
          placeholder="Opcional"
          placeholderTextColor="#555"
          autoCapitalize="characters"
        />
      </View>

      {/* ── Ubicación ── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Ubicación / Espacio</Text>
        <TextInput
          style={styles.input}
          value={espacio}
          onChangeText={setEspacio}
          placeholder="Ej: Sala de máquinas, piso 2..."
          placeholderTextColor="#555"
        />
      </View>

      {/* ── Notas ── */}
      <View style={styles.fieldGroup}>
        <Text style={styles.fieldLabel}>Notas</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={notas}
          onChangeText={setNotas}
          placeholder="Observaciones adicionales..."
          placeholderTextColor="#555"
          multiline
          numberOfLines={3}
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={handleGuardar}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={styles.saveBtnText}>REGISTRAR EQUIPO</Text>}
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#0A0A0A' },
  content:    { padding: 16 },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0A0A0A', gap: 12 },
  loadingText: { color: '#888', fontSize: 14 },
  pageTitle:  { fontSize: 20, fontWeight: '700', color: '#F5F5F5', marginBottom: 20 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#888888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 4,
    padding: 12, fontSize: 15, color: '#F5F5F5',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  clienteSelected: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#E8500A', borderRadius: 4,
    padding: 12, backgroundColor: 'rgba(232,80,10,0.08)',
  },
  clienteSelectedNombre: { fontSize: 15, color: '#F5F5F5', flex: 1 },
  clienteSelectedClear:  { fontSize: 16, color: '#888', paddingLeft: 12 },
  clienteDropdown: { borderWidth: 1, borderColor: '#1F1F1F', borderRadius: 4, backgroundColor: '#141414', marginTop: 4 },
  clienteOption:     { padding: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  clienteOptionText: { fontSize: 14, color: '#F5F5F5' },
  saveBtn:         { backgroundColor: '#E8500A', borderRadius: 4, padding: 16, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 1.5 },
});
