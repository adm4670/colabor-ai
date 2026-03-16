export const taskTools = [
  {
    type: "function",
    function: {
      name: "create_activity",
      description: "Salva uma nova atividade no sistema",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da atividade" },
          description: { type: "string", description: "Descrição da atividade" },
          date: { type: "string", description: "Data da atividade (YYYY-MM-DD)" }
        },
        required: ["title", "date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_activities_by_day",
      description: "Lista atividades de um dia específico",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data (YYYY-MM-DD)" }
        },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_activity",
      description: "Remove uma atividade",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "ID da atividade" }
        },
        required: ["id"]
      }
    }
  }
];