---
name: python-dev
description: "Boas praticas e instrucoes para escrever e executar codigo Python de forma eficiente."
keywords:
  - python
  - codigo
  - script
  - programacao
  - dev
  - desenvolvimento
  - algoritmo
---

# Python Development Skill

## Quando usar
- Quando o usuario pedir para criar ou modificar codigo Python
- Para analise de dados, automacao ou scripts
- Quando precisar resolver problemas computacionais

## Instrucoes

### 1. Prefira codigo simples e legivel
- Use nomes descritivos para variaveis e funcoes
- Evite otimizacoes prematuras
- Siga PEP 8 quando possivel

### 2. Tratamento de erros
- Sempre use try/except para operacoes que podem falhar
- Seja especifico nas excecoes que captura
- Forneca mensagens de erro claras

### 3. Performance
- Para datasets grandes, use pandas ou numpy
- Evite loops aninhados desnecessarios
- Use list comprehensions quando apropriado

### 4. E/S de arquivos
- Use context managers (with) para abrir arquivos
- Sempre feche recursos apos o uso
- Para arquivos grandes, processe linha a linha
