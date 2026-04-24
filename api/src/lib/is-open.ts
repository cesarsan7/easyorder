export interface Horario {
  dia: string;
  disponible: boolean;
  apertura_1: string | null;
  cierre_1: string | null;
  apertura_2: string | null;
  cierre_2: string | null;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Handles midnight-crossing: e.g. apertura=22:00 cierre=02:00
function inSlot(currentMins: number, apertura: string | null, cierre: string | null): boolean {
  if (!apertura || !cierre) return false;
  const open = timeToMinutes(apertura);
  const close = timeToMinutes(cierre);
  if (close < open) {
    // crosses midnight
    return currentMins >= open || currentMins < close;
  }
  return currentMins >= open && currentMins < close;
}

function getLocalDayAndMinutes(zona_horaria: string): { diaEs: string; currentMins: number } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('es-ES', {
    timeZone: zona_horaria,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const raw = parts.find(p => p.type === 'weekday')?.value ?? '';
  const diaEs = raw.charAt(0).toUpperCase() + raw.slice(1);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  return { diaEs, currentMins: h * 60 + m };
}

export function calcIsOpen(horarios: Horario[], zona_horaria: string): boolean {
  const { diaEs, currentMins } = getLocalDayAndMinutes(zona_horaria);
  const horario = horarios.find(h => h.dia === diaEs && h.disponible);
  if (!horario) return false;
  return (
    inSlot(currentMins, horario.apertura_1, horario.cierre_1) ||
    inSlot(currentMins, horario.apertura_2, horario.cierre_2)
  );
}

// Returns the schedule row for today regardless of disponible so the caller
// can show configured hours even on closed days. is_open already handles
// the closed case — this is intentionally broader than calcIsOpen.
export function getHorarioHoy(horarios: Horario[], zona_horaria: string): Horario | null {
  const { diaEs } = getLocalDayAndMinutes(zona_horaria);
  return horarios.find(h => h.dia === diaEs) ?? null;
}

// Returns the local time context for a given timezone:
// diaEs — current weekday name in Spanish (e.g. "Lunes")
// horaLocal — current local time as "HH:MM" (e.g. "14:32")
export function getLocalContext(zona_horaria: string): { diaEs: string; horaLocal: string } {
  const { diaEs, currentMins } = getLocalDayAndMinutes(zona_horaria);
  const h = Math.floor(currentMins / 60).toString().padStart(2, '0');
  const m = (currentMins % 60).toString().padStart(2, '0');
  return { diaEs, horaLocal: `${h}:${m}` };
}
