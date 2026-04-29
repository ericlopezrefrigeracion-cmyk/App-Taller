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
  | 'service'
  | 'instalacion'
  | 'garantia'
  | 'diagnostico'
  | 'otro';

export type PrioridadOT = 'baja' | 'normal' | 'alta' | 'urgente';

export interface UsuarioResumen {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export interface ClienteResumen {
  id: string;
  nombre: string;
  apellido: string | null;
  empresa: string | null;
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

export interface ProductoResumen {
  id: string;
  nombre: string;
  codigo: string | null;
  unidad: string;
  precio_costo: number | null;
}

export interface OTItem {
  id: string;
  cantidad: number;
  precio_unitario: number | null;
  notas: string | null;
  producto: ProductoResumen;
}

export interface OTFoto {
  id: string;
  url: string;
  descripcion: string | null;
  created_at: string;
}

export interface OTChecklistTarea {
  id: string;
  descripcion: string;
  orden: number;
  completada: boolean;
  completada_en: string | null;
  completada_por: UsuarioResumen | null;
}

export interface OTChecklist {
  id: string;
  nombre: string;
  tareas: OTChecklistTarea[];
}

export interface OTHistorial {
  id: string;
  estado_anterior: EstadoOT | null;
  estado_nuevo: EstadoOT;
  notas: string | null;
  created_at: string;
  usuario: UsuarioResumen | null;
}

export interface OrdenTrabajo {
  id: string;
  numero: number;
  tipo: TipoOT;
  estado: EstadoOT;
  prioridad: PrioridadOT;
  descripcion: string;
  diagnostico: string | null;
  trabajo_realizado: string | null;
  fecha_programada: string | null;
  hora_programada: string | null;
  notas: string | null;
  firma_cliente: string | null;
  firmado_por: string | null;
  created_at: string;
  updated_at: string;
  cliente: ClienteResumen;
  equipo: EquipoResumen | null;
  tecnico_asignado: UsuarioResumen | null;
  items: OTItem[];
  fotos: OTFoto[];
  checklists: OTChecklist[];
  historial: OTHistorial[];
}

export interface OTResumen {
  id: string;
  numero: number;
  tipo: TipoOT;
  estado: EstadoOT;
  prioridad: PrioridadOT;
  descripcion: string;
  fecha_programada: string | null;
  hora_programada: string | null;
  created_at: string;
  cliente: ClienteResumen;
  equipo: EquipoResumen | null;
  tecnico_asignado: UsuarioResumen | null;
}
