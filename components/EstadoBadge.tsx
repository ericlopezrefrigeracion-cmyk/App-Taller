import { Text, StyleSheet } from 'react-native';
import type { EstadoOT } from '../lib/types';

const CONFIG: Record<EstadoOT, { label: string; bg: string; text: string }> = {
  borrador:           { label: 'Borrador',            bg: '#2A2A2A', text: '#999999' },
  asignada:           { label: 'Asignada',            bg: '#1A2E4A', text: '#4A9EE8' },
  en_curso:           { label: 'En curso',            bg: '#2D1F00', text: '#E8A020' },
  pendiente_repuesto: { label: 'Pend. repuesto',      bg: '#2D2500', text: '#E8D020' },
  cerrada:            { label: 'Cerrada',             bg: '#0D2D1A', text: '#2ECC71' },
  cancelada:          { label: 'Cancelada',           bg: '#2D0D0D', text: '#E84040' },
};

interface Props {
  estado: EstadoOT;
}

export default function EstadoBadge({ estado }: Props) {
  const cfg = CONFIG[estado] ?? { label: estado, bg: '#2A2A2A', text: '#999999' };
  return (
    <Text style={[styles.badge, { backgroundColor: cfg.bg, color: cfg.text }]}>
      {cfg.label.toUpperCase()}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
