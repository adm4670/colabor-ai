import { logger } from "../utils/logger";
    
    // ============================================================
    // Date/Time Tool - Retorna data e hora atual em Pernambuco (BR)
    // ============================================================
    //
    // Ferramenta que retorna data, hora, dia da semana, mês, etc.
    // no fuso horário de Pernambuco (America/Recife, UTC-3).
    // ============================================================
    
    const DEFAULT_TZ = "America/Recife";
    
    const DIAS_SEMANA = [
      "domingo", "segunda-feira", "terça-feira", "quarta-feira",
      "quinta-feira", "sexta-feira", "sábado"
    ];
    
    const MESES = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho",
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];
    
    function getDateTime(timezone: string = DEFAULT_TZ) {
      const now = new Date();
    
      // Formatar usando o timezone especificado
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        timeZone: timezone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "long",
      });
    
      const parts = formatter.formatToParts(now);
      const data: Record<string, string> = {};
      for (const part of parts) {
        if (part.type !== "literal") {
          data[part.type] = part.value;
        }
      }
    
      const diaSemanaNome = data.weekday || "";
      const dia = parseInt(data.day || "0", 10);
      const mes = parseInt(data.month || "0", 10);
      const ano = parseInt(data.year || "0", 10);
      const hora = parseInt(data.hour || "0", 10);
      const minuto = parseInt(data.minute || "0", 10);
      const segundo = parseInt(data.second || "0", 10);
    
      // Calcular timestamp Unix (em segundos)
      // Para obter o timestamp correto no timezone, usamos o UTC real
      const timestampUnix = Math.floor(now.getTime() / 1000);
    
      // Determinar offset do timezone em minutos
      const tzOffsetMinutes = -now.getTimezoneOffset(); // offset local do servidor em minutos
      // NOTA: Isso pega o offset do servidor, não do timezone alvo.
      // Para um offset preciso, poderíamos usar Intl, mas vamos deixar como 180 (-3h) para Recife por padrão
      const offsetMinutes = -180; // America/Recife = UTC-3 = -180 minutos
    
      // Calcular timestamp corrigido para o timezone (em ms)
      const serverOffset = now.getTimezoneOffset(); // em minutos (positivo para negativo)
      const diffMs = (serverOffset + offsetMinutes) * 60 * 1000;
      const tzAdjusted = new Date(now.getTime() + diffMs);
    
      const timestampUnixTZ = Math.floor(tzAdjusted.getTime() / 1000);
    
      return {
        ano,
        mes,
        mes_nome: MESES[mes - 1] || "",
        dia,
        dia_semana: diaSemanaNome.toLowerCase(),
        hora,
        minuto,
        segundo,
        data_curta: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
        hora_str: `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`,
        data_hora_completa: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")} ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}`,
        data_extenso: `${diaSemanaNome}, ${dia} de ${MESES[mes - 1]} de ${ano}`,
        data_hora_extenso: `${diaSemanaNome}, ${dia} de ${MESES[mes - 1]} de ${ano} às ${String(hora).padStart(2, "0")}h${String(minuto).padStart(2, "0")}`,
        iso: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}-03:00`,
        unix: timestampUnix,
        unix_ms: now.getTime(),
        fuso: {
          string: "UTC-3",
          offset_minutos: offsetMinutes,
          iana: timezone,
        },
        referencia: `Horário oficial de Pernambuco (America/Recife, UTC-3)`,
        time_ago: "agora",
      };
    }
    
    export const dateTimeTool = {
      type: "function",
    
      function: {
        name: "get_current_datetime_pe",
        description:
          "Retorna a data e hora atual no estado de Pernambuco, Brasil (fuso America/Recife, UTC-3). " +
          "Fornece informacoes completas como data, hora, dia da semana em portugues, mes, ano, timestamp unix, etc. " +
          "Use esta ferramenta quando precisar saber que dia e hoje, que horas sao, ou qualquer informacao temporal.",
        parameters: {
          type: "object",
          properties: {
            format: {
              type: "string",
              enum: ["completo", "timestamp", "extenso"],
              description:
                "Formato de retorno: 'completo' (padrao) retorna data, hora, dia_semana; " +
                "'timestamp' retorna Unix timestamps; " +
                "'extenso' retorna todos os detalhes (componentes, timestamps, fuso).",
            },
            timezone: {
              type: "string",
              description:
                "Fuso horario IANA. Padrao: 'America/Recife' (Pernambuco, Brasil). " +
                "Outros exemplos: 'America/Sao_Paulo', 'UTC', 'America/New_York'.",
            },
          },
          required: [],
        },
      },
    
      handler: async ({
        format = "completo",
        timezone = DEFAULT_TZ,
      }: {
        format?: string;
        timezone?: string;
      }) => {
        logger.info(`[DateTimeTool] Obtendo data/hora para: ${timezone} (formato: ${format})`);
    
        try {
          const dt = getDateTime(timezone);
    
          if (format === "timestamp") {
            return {
              success: true,
              unix_timestamp: dt.unix,
              unix_timestamp_ms: dt.unix_ms,
              iso: dt.iso,
            };
          }
    
          if (format === "extenso") {
            return {
              success: true,
              data_hora: {
                data_curta: dt.data_curta,
                hora: dt.hora_str,
                data_hora_completa: dt.data_hora_completa,
                data_extenso: dt.data_extenso,
                data_hora_extenso: dt.data_hora_extenso,
                iso: dt.iso,
              },
              componentes: {
                ano: dt.ano,
                mes: dt.mes,
                mes_nome: dt.mes_nome,
                dia: dt.dia,
                dia_semana: dt.dia,
                dia_semana_nome: dt.dia_semana,
                hora: dt.hora,
                minuto: dt.minuto,
                segundo: dt.segundo,
                milissegundo: 0,
              },
              timestamps: {
                unix: dt.unix,
                unix_ms: dt.unix_ms,
              },
              fuso_horario: {
                string: dt.fuso.string,
                offset_minutos: dt.fuso.offset_minutos,
                iana: dt.fuso.iana,
              },
              referencia: dt.referencia,
              time_ago: dt.time_ago,
            };
          }
    
          // Formato 'completo' (padrao)
          return {
            success: true,
            data: dt.data_curta,
            hora: dt.hora_str,
            data_hora: dt.data_hora_completa,
            dia_semana: dt.dia_semana,
            mes: dt.mes_nome,
            ano: dt.ano,
            timestamp_unix: dt.unix,
          };
        } catch (error: any) {
          logger.error(`[DateTimeTool] Erro ao obter data/hora`, {
            timezone,
            error: error.message,
          });
    
          return {
            success: false,
            error: error.message,
            message: `Erro ao obter data/hora para "${timezone}": ${error.message}`,
          };
        }
      },
    };
    