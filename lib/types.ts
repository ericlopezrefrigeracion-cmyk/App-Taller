import { UPLOADS_URL } from './config';

export function buildFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${UPLOADS_URL}${path}`;
}

export type EstadoOT =
  | 'borrador'
  | 'asignada'
  | 'en_curso'
  | 'pendiente_repuesto'
  | 'cerrada'
  | 'cancelada';

export type TipoOT =
  | 'correctivo'
  | 'preventivo'
  | 'instalacion';

export type PrioridadOT = 'baja' | 'normal' | 'alta' | 'urgente';

// ─── Tipos para GET /ots/mis-ots (respuesta transformada por el backend) ────

export interface ClienteResumen {
  id: string;
  nombre: string | null;
  apellido: string | null;
  empresa: string | null;   // razon_social para empresas
  telefono: string | null;
  email: string | null;
}

export interface EquipoResumen {
  id: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  tipo: string;
  ubicacion: string | null;
}

export interface OTResumen {
  id: string;
  numero: string;
  tipo: TipoOT;
  estado: EstadoOT;
  prioridad: PrioridadOT;
  descripcion: string;
  fecha_programada: string | null;
  hora_programada: string | null;
  created_at: string;
  cliente: ClienteResumen;
  equipo: EquipoResumen | null;
  tecnico_asignado: { id: string; nombre: string; email: string; rol: string } | null;
}

// ─── Tipos para GET /ots/:id (formato nativo del backend) ───────────────────

export interface OTClienteDetalle {
  id: string;
  tipo: string;
  nombre: string | null;
  apellido: string | null;
  razon_social: string | null;
  contactos: { nombre: string; telefono: string | null; whatsapp: string | null; email: string | null }[];
}

export interface OTEquipoDetalle {
  id: string;
  codigo_interno: string;
  espacio: string | null;
  numero_serie: string | null;
  tipo: { nombre: string; rubro?: { nombre: string } } | null;
  modelo: { nombre: string; marca: { nombre: string } } | null;
}

export interface OTItem {
  id: string;
  cantidad: number;
  notas: string | null;
  precio_costo_usd_snap: string;
  tc_valor_snap: string;
  producto: {
    id: string;
    nombre: string;
    codigo: string | null;
    tipo: string;
    unidad: string;
  };
}

export interface OTFoto {
  id: string;
  url: string;
  descripcion: string | null;
  creado_en: string;
}

export interface OTChecklistTarea {
  id: string;
  nombre: string;
  orden: number;
  obligatoria: boolean;
  completada: boolean;
  completada_en: string | null;
}

export interface OTChecklist {
  id: string;
  plantilla_nombre: string;
  tareas: OTChecklistTarea[];
}

export interface OTHistorial {
  id: string;
  estado_desde: EstadoOT | null;
  estado_hasta: EstadoOT;
  notas: string | null;
  creado_en: string;
  usuario_id: string;
}

export interface OrdenTrabajo {
  id: string;
  numero: string;
  tipo: TipoOT;
  estado: EstadoOT;
  descripcion: string;
  diagnostico: string | null;
  trabajo_realizado: string | null;
  fecha_programada: string | null;
  hora_programada: string | null;
  notas_internas: string | null;
  firma_cliente: string | null;
  firmado_por: string | null;
  es_garantia: boolean;
  creado_en: string;
  actualizado_en: string;
  cliente: OTClienteDetalle;
  equipo: OTEquipoDetalle | null;
  tecnico: { id: string; nombre: string; apellido: string; email: string } | null;
  items: OTItem[];
  fotos: OTFoto[];
  checklist: OTChecklist[];
  historial: OTHistorial[];
}
