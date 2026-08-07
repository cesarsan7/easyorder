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

// Orden de días en español para calcular el siguiente día disponible
const DIAS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function fmtTime(t: string): string {
  // "14:30:00" → "14:30", "08:00" → "8:00"
  const [h, m] = t.split(':');
  return `${parseInt(h, 10)}:${m}`;
}

// Devuelve un string amigable con la próxima apertura, ej:
// "hoy a las 19:00" / "mañana a las 8:00" / "el Miércoles a las 9:00"
// Devuelve null si no hay horarios disponibles configurados.
export function getNextOpening(horarios: Horario[], zona_horaria: string): string | null {
  const { diaEs, currentMins } = getLocalDayAndMinutes(zona_horaria);
  const todayIdx = DIAS_ES.indexOf(diaEs);
  if (todayIdx === -1) return null;

  // Buscar el próximo turno disponible empezando desde hoy
  for (let offset = 0; offset < 7; offset++) {
    const idx = (todayIdx + offset) % 7;
    const dia = DIAS_ES[idx];
    const horario = horarios.find(h => h.dia === dia && h.disponible);
    if (!horario) continue;

    const slots = [
      { apertura: horario.apertura_1, cierre: horario.cierre_1 },
      { apertura: horario.apertura_2, cierre: horario.cierre_2 },
    ];

    for (const slot of slots) {
      if (!slot.apertura || !slot.cierre) continue;
      const openMins = timeToMinutes(slot.apertura);
      // Si es hoy, solo contar si aún no ha pasado la apertura
      if (offset === 0 && openMins <= currentMins) continue;
      const label = offset === 0 ? 'hoy' : offset === 1 ? 'mañana' : `el ${dia}`;
      return `${label} a las ${fmtTime(slot.apertura)}`;
    }
  }
  return null;
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
