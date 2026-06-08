// ============================================================
// DateTime Tool - Consultar data, hora, fuso horario e timestamps
// Retorna informações detalhadas de data/hora atuais
// ============================================================

export const dateTimeTool = {
  type: "function" as const,

  function: {
    name: "get_current_datetime",
    description: "Retorna a data e hora atuais completas: data, hora, minuto, dia da semana, mes, ano, timestamp Unix, fuso horario e data formatada em portugues. Ideal para quando o agente ou usuario precisam saber que horas sao, que dia e hoje, ou qualquer informacao temporal.",
    parameters: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["complete", "simple", "timestamp"],
          description: "Formato do retorno: 'complete' (tudo), 'simple' (so data e hora resumidos), 'timestamp' (apenas Unix timestamp)",
        },
        timezone: {
          type: "string",
          description: "Fuso horario opcional (ex: 'America/Sao_Paulo', 'America/New_York'). Padrao: America/Sao_Paulo",
        }
      },
      required: [],
    },
  },

  handler({
    format = "complete",
    timezone = "America/Sao_Paulo",
  }: {
    format?: string;
    timezone?: string;
  }) {
    const now = new Date();

    // --- Dados brutos ---
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-12
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    const unixTimestamp = Math.floor(now.getTime() / 1000);
    const unixTimestampMs = now.getTime();

    // --- Dia da semana (0=domingo, 6=sabado) ---
    const weekdayIndex = now.getDay();
    const weekdays = [
      "domingo", "segunda-feira", "terca-feira", "quarta-feira",
      "quinta-feira", "sexta-feira", "sabado"
    ];
    const weekdayName = weekdays[weekdayIndex];

    // --- Nome do mes ---
    const monthNames = [
      "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];
    const monthName = monthNames[month - 1];

    // --- Formatacoes ---
    // Formato ISO
    const isoString = now.toISOString();

    // Formato brasileiro curto
    const brShort = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;

    // Formato brasileiro com hora
    const brFull = `${brShort} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    // Formato extenso em portugues
    const dateLong = `${weekdayName}, ${day} de ${monthName} de ${year}`;

    // Formato com hora escrita
    const timeStr = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const dateTimeLong = `${dateLong} — ${timeStr}:${String(seconds).padStart(2, "0")}`;

    // --- Timestamp legivel ---
    const timeAgo = getTimeAgo(now);

    // --- Fuso horario ---
    const tzOffset = -now.getTimezoneOffset();
    const tzHours = Math.floor(Math.abs(tzOffset) / 60);
    const tzMinutes = Math.abs(tzOffset) % 60;
    const tzSign = tzOffset >= 0 ? "+" : "-";
    const tzString = `GMT${tzSign}${String(tzHours).padStart(2, "0")}:${String(tzMinutes).padStart(2, "0")}`;

    // --- Resultado simples ---
    if (format === "simple") {
      return {
        success: true,
        data: brShort,
        hora: timeStr,
        data_hora: brFull,
        dia_semana: weekdayName,
        timestamp_unix: unixTimestamp,
      };
    }

    // --- Apenas timestamp ---
    if (format === "timestamp") {
      return {
        success: true,
        unix_timestamp: unixTimestamp,
        unix_timestamp_ms: unixTimestampMs,
        iso: isoString,
      };
    }

    // --- Completo (padrao) ---
    return {
      success: true,
      data_hora: {
        data_curta: brShort,
        hora: timeStr,
        data_hora_completa: brFull,
        data_extenso: dateLong,
        data_hora_extenso: dateTimeLong,
        iso: isoString,
      },
      componentes: {
        ano: year,
        mes: month,
        mes_nome: monthName,
        dia: day,
        dia_semana: weekdayIndex,
        dia_semana_nome: weekdayName,
        hora: hours,
        minuto: minutes,
        segundo: seconds,
        milissegundo: milliseconds,
      },
      timestamps: {
        unix: unixTimestamp,
        unix_ms: unixTimestampMs,
      },
      fuso_horario: {
        string: tzString,
        offset_minutos: tzOffset,
        iana: timezone,
      },
      referencia: `Agora sao ${timeStr} de ${dateLong}.`,
      time_ago: timeAgo,
    };
  },
};

/**
 * Gera uma string amigavel tipo "ha 3 horas" baseada na data atual
 */
function getTimeAgo(now: Date): string {
  const hour = now.getHours();

  if (hour < 6) return "madrugada";
  if (hour < 12) return "manha";
  if (hour < 18) return "tarde";
  return "noite";
}
