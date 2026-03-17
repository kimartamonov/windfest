# Windmill Implementation Plan: Агентский инвесткомитет

> Целевой репозиторий: `kimartamonov/windfest`
> Исходная логика: `IC_Committee_Logic.md` (10 тактов, 14 ролей-работников)
> Рантайм: Bun/TypeScript (defaultTs: bun)
> Пространство: `f/ic/` (investment committee)

---

## 1. Архитектурные решения

### 1.1 Маппинг тактов на Windmill-примитивы

| Такт | Логическая фаза | Windmill-примитив | Обоснование |
|------|-----------------|-------------------|-------------|
| 0 — Инициализация | IDLE → LOADING | **rawscript** (шаг flow) | Чистая функция: собрать Session из входов |
| 1 — Загрузка контекста | LOADING | **branchall** (parallel) | KAG, Ontology, Portfolio — независимые запросы |
| 2 — Первичные позиции | PRIMARY_POSITIONS | **forloopflow** по ролям | Каждый агент генерирует OPENING последовательно (нужен накопленный контекст предыдущих) |
| 3 — Перекрёстные дебаты | CROSS_DEBATE | **whileloopflow** (раунды) + вложенный **forloopflow** (агенты) | До 5 раундов с проверкой сходимости |
| 4 — Рефлексия | REFLECTION | **rawscript** | Чистая аналитика без LLM-вызовов |
| 5 — Финальные позиции | FINAL_POSITIONS | **forloopflow** по ролям | Аналогично такту 2, но тип SYNTHESIS |
| 6 — Голосование | VOTING | **rawscript** | Детерминированный скоринг + агрегация |
| 7 — Синтез решения | SYNTHESIS | **rawscript** (chairman) + **rawscript** (dialectic) | Два мета-агента последовательно |
| 8 — Одобрение человеком | HUMAN_APPROVAL | **suspend** | Нативный Windmill Approval с resume/cancel URL |
| 9 — Фиксация решения | CONCLUDED | **branchall** (parallel) | Параллельная запись в FST, KAG, Portfolio |

### 1.2 Состояние сессии

Windmill flow передаёт данные между шагами через `results.step_id`. Нет нужды в in-memory DebateRoom — каждый шаг получает результат предыдущего. Вся история аргументов — массив, нарастающий по ходу flow.

### 1.3 Ресурсы Windmill

| Resource Type | Назначение |
|--------------|------------|
| `ic_llm_provider` | API-ключ и endpoint LLM (OpenAI-compatible) |
| `ic_integram` | Credentials для Integram (icParams, проекты) |
| `ic_kag` | Endpoint базы знаний KAG |
| `ic_fst` | Endpoint системы FST для сохранения решений |

---

## 2. Файловая структура

```
f/ic/
├── flows/
│   └── run_ic_session.flow/
│       ├── flow.yaml                    # Главный flow (оркестратор всех тактов)
│       └── inline scripts (через !inline)
│
├── scripts/
│   ├── init_session.ts                  # Такт 0: нормализация входа, сборка Session
│   ├── load_kag_context.ts              # Такт 1: запрос к KAG
│   ├── load_ontology_context.ts         # Такт 1: запрос к онтологии
│   ├── load_portfolio_links.ts          # Такт 1: портфельные пересечения
│   ├── build_shared_context.ts          # Такт 1: сборка единого контекстного снапшота
│   ├── build_role_prompt.ts             # Общий: сборка system prompt для роли
│   ├── call_llm.ts                      # Общий: вызов LLM с retry + JSON-парсинг
│   ├── parse_role_output.ts             # Общий: парсинг и валидация ответа LLM
│   ├── run_role_opening.ts              # Такт 2: генерация OPENING-аргумента одной ролью
│   ├── run_debate_round.ts             # Такт 3: один раунд дебатов (challenge + counter для всех)
│   ├── check_convergence.ts             # Такт 3: проверка сходимости confidence
│   ├── detect_contradictions.ts         # Такт 4: поиск пар тезис-антитезис
│   ├── build_debate_graph.ts            # Такт 4: построение графа + IBIS + belief drift
│   ├── run_role_synthesis.ts            # Такт 5: генерация SYNTHESIS-аргумента одной ролью
│   ├── compute_dimension_scores.ts      # Такт 6: скоры по 7 измерениям
│   ├── aggregate_votes.ts               # Такт 6: взвешенная агрегация + вердикт
│   ├── run_chairman_synthesis.ts        # Такт 7: синтез Chairman
│   ├── run_dialectic_synthesis.ts       # Такт 7: T-схема Dialectic
│   ├── assemble_conditional_decision.ts # Такт 7: сборка ConditionalDecision
│   ├── save_to_fst.ts                   # Такт 9: запись в FST
│   ├── save_to_kag.ts                   # Такт 9: экспорт в KAG
│   └── save_portfolio_links.ts          # Такт 9: запись портфельных связей
│
├── resources/
│   ├── role_catalog.json                # 14 ролей: id, systemPrompt, scoringWeights, bias, weight
│   ├── phase_policy.json                # Политики фаз (maxRounds, convergenceThreshold)
│   ├── voting_policy.json               # Пороги: approveThreshold, deferThreshold
│   ├── model_policy.json                # Модели по ролям: model, temperature, maxTokens
│   └── prompt_catalog.json              # Шаблоны промптов по типам аргументов
│
└── docs/
    └── IC_Committee_Logic.md            # Исходный документ логики
```

---

## 3. Главный Flow: `run_ic_session`

### 3.1 Входные параметры (flow schema)

```typescript
{
  project: {
    title: string
    subFund: string          // БАС | РОБОТ | МЭ | КОСМОС | ЭНЕРГИЯ | ИИ
    trl: number              // 1–9
    mrl: number              // 1–10
    irr: number              // 0.0–1.0
    marketSize: number       // TAM в рублях
    teamStrength: number     // 0.0–1.0
    stage: string            // seed | series_a | series_b | growth
    riskFactors: number      // 0.0–1.0
    sovereigntyScore: number // 0–9
    factorScores?: { T, S, M, G, E }  // Факторные скоры (опционально)
  }
  icParams?: {
    approveThreshold: number   // default 72
    deferThreshold: number     // default 50
    maxRounds: number          // default 5
    votingMode: string         // formula | hybrid | llm
  }
}
```

### 3.2 Структура Flow (YAML — псевдокод)

```yaml
summary: "Сессия агентского инвесткомитета"
value:
  modules:

    # ──────────────────────────────────────────────
    # ТАКТ 0 — Инициализация сессии
    # ──────────────────────────────────────────────
    - id: init_session
      summary: "Такт 0: Инициализация — собрать Session, загрузить каталог ролей"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/init_session.ts
        input_transforms:
          project:  { type: javascript, expr: "flow_input.project" }
          icParams: { type: javascript, expr: "flow_input.icParams" }

    # ──────────────────────────────────────────────
    # ТАКТ 1 — Загрузка контекста (параллельно)
    # ──────────────────────────────────────────────
    - id: load_context
      summary: "Такт 1: Загрузка контекста — KAG, Ontology, Portfolio параллельно"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "KAG — прецеденты прошлых ИК"
            modules:
              - id: load_kag
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/load_kag_context.ts
                  input_transforms:
                    project: { type: javascript, expr: "results.init_session.project" }

          - summary: "Ontology — доменные концепты"
            modules:
              - id: load_ontology
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/load_ontology_context.ts
                  input_transforms:
                    project: { type: javascript, expr: "results.init_session.project" }

          - summary: "Portfolio — пересечения с портфелем"
            modules:
              - id: load_portfolio
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/load_portfolio_links.ts
                  input_transforms:
                    project: { type: javascript, expr: "results.init_session.project" }

    - id: build_context
      summary: "Такт 1 (завершение): Сборка единого контекстного снапшота"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/build_shared_context.ts
        input_transforms:
          session:   { type: javascript, expr: "results.init_session" }
          kag:       { type: javascript, expr: "results.load_kag" }
          ontology:  { type: javascript, expr: "results.load_ontology" }
          portfolio: { type: javascript, expr: "results.load_portfolio" }

    # ──────────────────────────────────────────────
    # ТАКТ 2 — Первичные позиции (forloop по ролям)
    # ──────────────────────────────────────────────
    - id: opening_round
      summary: "Такт 2: Opening — каждая роль генерирует первичную позицию"
      value:
        type: forloopflow
        iterator:
          type: javascript
          expr: "results.init_session.roleCatalog.roles"
        skip_failures: false
        parallel: false    # последовательно — каждый видит аргументы предыдущих
        modules:
          - id: run_opening
            value:
              type: rawscript
              language: bun
              content: !inline ../scripts/run_role_opening.ts
              input_transforms:
                role:          { type: javascript, expr: "flow_input.iter.value" }
                project:       { type: javascript, expr: "results.init_session.project" }
                context:       { type: javascript, expr: "results.build_context" }
                priorArgs:     { type: javascript, expr: "results.opening_round ?? []" }

    # ──────────────────────────────────────────────
    # ТАКТ 3 — Перекрёстные дебаты (whileloop раундов)
    # ──────────────────────────────────────────────
    - id: cross_debate
      summary: "Такт 3: Дебаты — до N раундов challenge/counter с проверкой сходимости"
      value:
        type: whileloopflow
        skip_failures: false
        modules:
          - id: debate_round
            summary: "Один раунд дебатов для всех агентов"
            value:
              type: rawscript
              language: bun
              content: !inline ../scripts/run_debate_round.ts
              input_transforms:
                roles:      { type: javascript, expr: "results.init_session.roleCatalog.roles" }
                project:    { type: javascript, expr: "results.init_session.project" }
                context:    { type: javascript, expr: "results.build_context" }
                allArgs:    { type: javascript, expr: "(() => { const opening = results.opening_round || []; const prev = results.debate_round?.allArgs || []; return [...opening, ...prev]; })()" }
                roundIndex: { type: javascript, expr: "(results.debate_round?.roundIndex ?? 0) + 1" }

          - id: convergence_check
            summary: "Проверка сходимости — остановка при стабильности confidence"
            value:
              type: rawscript
              language: bun
              content: !inline ../scripts/check_convergence.ts
              input_transforms:
                allArgs:   { type: javascript, expr: "results.debate_round.allArgs" }
                round:     { type: javascript, expr: "results.debate_round.roundIndex" }
                maxRounds: { type: javascript, expr: "results.init_session.icParams.maxRounds" }
            stop_after_if:
              expr: "result.shouldStop"
              skip_if_stopped: true

    # ──────────────────────────────────────────────
    # ТАКТ 4 — Рефлексия
    # ──────────────────────────────────────────────
    - id: reflection
      summary: "Такт 4: Рефлексия — противоречия, граф дебатов, дрейф убеждений"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Детекция противоречий"
            modules:
              - id: detect_contradictions
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/detect_contradictions.ts
                  input_transforms:
                    allArgs: { type: javascript, expr: "results.debate_round.allArgs" }

          - summary: "Граф дебатов + IBIS + belief drift"
            modules:
              - id: build_graph
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/build_debate_graph.ts
                  input_transforms:
                    allArgs: { type: javascript, expr: "results.debate_round.allArgs" }

    # ──────────────────────────────────────────────
    # ТАКТ 5 — Финальные позиции (forloop по ролям)
    # ──────────────────────────────────────────────
    - id: final_positions
      summary: "Такт 5: Synthesis — каждая роль формулирует итоговую позицию"
      value:
        type: forloopflow
        iterator:
          type: javascript
          expr: "results.init_session.roleCatalog.roles"
        skip_failures: false
        parallel: false
        modules:
          - id: run_synthesis
            value:
              type: rawscript
              language: bun
              content: !inline ../scripts/run_role_synthesis.ts
              input_transforms:
                role:            { type: javascript, expr: "flow_input.iter.value" }
                project:         { type: javascript, expr: "results.init_session.project" }
                context:         { type: javascript, expr: "results.build_context" }
                allArgs:         { type: javascript, expr: "results.debate_round.allArgs" }
                contradictions:  { type: javascript, expr: "results.detect_contradictions" }
                debateGraph:     { type: javascript, expr: "results.build_graph" }

    # ──────────────────────────────────────────────
    # ТАКТ 6 — Голосование
    # ──────────────────────────────────────────────
    - id: compute_scores
      summary: "Такт 6a: Вычисление скоров по 7 измерениям"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/compute_dimension_scores.ts
        input_transforms:
          project: { type: javascript, expr: "results.init_session.project" }

    - id: voting
      summary: "Такт 6b: Агрегация голосов → взвешенный скор → вердикт"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/aggregate_votes.ts
        input_transforms:
          dimScores:    { type: javascript, expr: "results.compute_scores" }
          roleCatalog:  { type: javascript, expr: "results.init_session.roleCatalog" }
          icParams:     { type: javascript, expr: "results.init_session.icParams" }
          synthesisArgs: { type: javascript, expr: "results.final_positions" }

    # ──────────────────────────────────────────────
    # ТАКТ 7 — Синтез решения (Chairman → Dialectic → сборка)
    # ──────────────────────────────────────────────
    - id: chairman_synthesis
      summary: "Такт 7a: Chairman — взвешенный итог + основание вердикта"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/run_chairman_synthesis.ts
        input_transforms:
          allArgs:       { type: javascript, expr: "results.debate_round.allArgs" }
          votes:         { type: javascript, expr: "results.voting" }
          contradictions: { type: javascript, expr: "results.detect_contradictions" }
          project:       { type: javascript, expr: "results.init_session.project" }
          context:       { type: javascript, expr: "results.build_context" }

    - id: dialectic_synthesis
      summary: "Такт 7b: Dialectic — T-схема, условия из противоречий"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/run_dialectic_synthesis.ts
        input_transforms:
          contradictions: { type: javascript, expr: "results.detect_contradictions" }
          allArgs:        { type: javascript, expr: "results.debate_round.allArgs" }
          votes:          { type: javascript, expr: "results.voting" }
          project:        { type: javascript, expr: "results.init_session.project" }
          context:        { type: javascript, expr: "results.build_context" }

    - id: conditional_decision
      summary: "Такт 7c: Сборка ConditionalDecision"
      value:
        type: rawscript
        language: bun
        content: !inline ../scripts/assemble_conditional_decision.ts
        input_transforms:
          votes:            { type: javascript, expr: "results.voting" }
          chairman:         { type: javascript, expr: "results.chairman_synthesis" }
          dialectic:        { type: javascript, expr: "results.dialectic_synthesis" }
          contradictions:   { type: javascript, expr: "results.detect_contradictions" }
          project:          { type: javascript, expr: "results.init_session.project" }

    # ──────────────────────────────────────────────
    # ТАКТ 8 — Одобрение человеком (Windmill Suspend)
    # ──────────────────────────────────────────────
    - id: human_approval
      summary: "Такт 8: Одобрение человеком — suspend flow до получения approve/reject"
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(decision: any) {
            return {
              decision_summary: {
                verdict: decision.verdict,
                score: decision.aggregatedScore,
                conditions_count: decision.conditions?.length ?? 0,
                key_conditions: decision.conditions
                  ?.filter((c: any) => c.priority === 'BLOCKER')
                  .map((c: any) => c.text) ?? []
              },
              awaiting_approval: true
            }
          }
        input_transforms:
          decision: { type: javascript, expr: "results.conditional_decision" }
      suspend:
        required_events: 1
        timeout: 604800        # 7 дней таймаут
        resume_form:
          schema:
            type: object
            properties:
              approved:
                type: boolean
                description: "Одобрить решение инвесткомитета?"
                default: true
              comments:
                type: string
                description: "Комментарии (опционально)"
            required: [approved]

    # ──────────────────────────────────────────────
    # ТАКТ 9 — Фиксация решения (параллельно)
    # ──────────────────────────────────────────────
    - id: check_approval
      summary: "Проверка: одобрено ли человеком"
      value:
        type: rawscript
        language: bun
        content: |
          export async function main(resumePayload: any) {
            if (!resumePayload?.approved) {
              throw new Error("Решение отклонено человеком: " + (resumePayload?.comments ?? "без комментариев"))
            }
            return { approved: true, comments: resumePayload?.comments }
          }
        input_transforms:
          resumePayload: { type: javascript, expr: "results.human_approval.resume" }

    - id: persist_decision
      summary: "Такт 9: Фиксация — FST, KAG, Portfolio параллельно"
      value:
        type: branchall
        parallel: true
        branches:
          - summary: "Запись в FST"
            modules:
              - id: save_fst
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/save_to_fst.ts
                  input_transforms:
                    decision: { type: javascript, expr: "results.conditional_decision" }
                    approval: { type: javascript, expr: "results.check_approval" }

          - summary: "Экспорт в KAG"
            modules:
              - id: save_kag
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/save_to_kag.ts
                  input_transforms:
                    session:  { type: javascript, expr: "results.init_session" }
                    allArgs:  { type: javascript, expr: "results.debate_round.allArgs" }
                    decision: { type: javascript, expr: "results.conditional_decision" }

          - summary: "Портфельные связи"
            modules:
              - id: save_portfolio
                value:
                  type: rawscript
                  language: bun
                  content: !inline ../scripts/save_portfolio_links.ts
                  input_transforms:
                    project:  { type: javascript, expr: "results.init_session.project" }
                    decision: { type: javascript, expr: "results.conditional_decision" }

  # ──────────────────────────────────────────────
  # FAILURE HANDLER
  # ──────────────────────────────────────────────
  failure_module:
    id: failure
    summary: "Обработка ошибок сессии ИК"
    value:
      type: rawscript
      language: bun
      content: |
        export async function main(error: {
          message: string; step_id: string; name: string; stack: string
        }) {
          console.error(`IC Session failed at step [${error.step_id}]: ${error.message}`)
          return {
            kind: "ic.session.error",
            step: error.step_id,
            error: error.message,
            timestamp: new Date().toISOString()
          }
        }
      input_transforms:
        error: { type: javascript, expr: "error" }
```

---

## 4. Потоки данных между шагами (results graph)

```
flow_input.project, flow_input.icParams
         │
         ▼
    ┌─────────────┐
    │ init_session │ → results.init_session
    └─────┬───────┘   { session, project, roleCatalog, icParams }
          │
          ▼
    ┌─────────────────┐ (branchall parallel)
    │ load_kag        │ → results.load_kag
    │ load_ontology   │ → results.load_ontology
    │ load_portfolio  │ → results.load_portfolio
    └─────┬───────────┘
          │
          ▼
    ┌───────────────┐
    │ build_context  │ → results.build_context
    └─────┬─────────┘   { sharedContextSnapshot }
          │
          ▼
    ┌────────────────┐ (forloop: roles)
    │ opening_round  │ → results.opening_round
    └─────┬──────────┘   [ Argument(OPENING) × N ]
          │
          ▼
    ┌──────────────┐ (whileloop: rounds 1–5)
    │ cross_debate │ → results.debate_round
    │  └ debate_round     { allArgs, roundIndex }
    │  └ convergence_check
    └─────┬────────┘
          │
          ▼
    ┌────────────┐ (branchall parallel)
    │ reflection │
    │  └ detect_contradictions → results.detect_contradictions
    │  └ build_graph           → results.build_graph
    └─────┬──────┘
          │
          ▼
    ┌──────────────────┐ (forloop: roles)
    │ final_positions  │ → results.final_positions
    └─────┬────────────┘   [ Argument(SYNTHESIS) × N ]
          │
          ▼
    ┌────────────────┐
    │ compute_scores │ → results.compute_scores
    │ voting         │ → results.voting
    └─────┬──────────┘   { votes[], aggregatedScore, verdict }
          │
          ▼
    ┌──────────────────────┐
    │ chairman_synthesis   │ → results.chairman_synthesis
    │ dialectic_synthesis  │ → results.dialectic_synthesis
    │ conditional_decision │ → results.conditional_decision
    └─────┬────────────────┘   { ConditionalDecision }
          │
          ▼
    ┌─────────────────┐
    │ human_approval  │ ⏸ suspend (ждёт approve)
    │ check_approval  │
    └─────┬───────────┘
          │
          ▼
    ┌──────────────────┐ (branchall parallel)
    │ persist_decision │
    │  └ save_fst
    │  └ save_kag
    │  └ save_portfolio
    └──────────────────┘
```

---

## 5. Спецификации ключевых скриптов

### 5.1 `init_session.ts`

```
Вход:  project: ProjectInput, icParams?: ICParamsInput
Выход: { session: { id, timestamp }, project (нормализованный), roleCatalog, icParams (с defaults) }
Логика:
  - Генерирует session.id = `ic_${Date.now()}_${random}`
  - Нормализует project: заполняет defaults, валидирует ranges
  - Загружает role_catalog.json из Windmill resource
  - Мержит icParams с defaults { approveThreshold: 72, deferThreshold: 50, maxRounds: 5, votingMode: 'formula' }
```

### 5.2 `call_llm.ts`

```
Вход:  systemPrompt: string, userPrompt: string, modelConfig: { model, temperature, maxTokens }
Выход: { raw: string, parsed: { text, dimension, confidence, stance }, tokensUsed: number }
Логика:
  - Вызов OpenAI-compatible API через ic_llm_provider ресурс
  - Retry 1 раз при таймауте (30s)
  - JSON-парсинг с fallback на plain text (confidence=0.7, stance=null)
```

### 5.3 `run_role_opening.ts`

```
Вход:  role, project, context, priorArgs[]
Выход: Argument(OPENING) { id, agentId, type: 'OPENING', text, dimension, confidence, stance, timestamp }
Логика:
  - build_role_prompt(role, 'OPENING', project, context)
  - call_llm(systemPrompt, userPrompt, modelConfig)
  - parse_role_output(llmResponse) → Argument
```

### 5.4 `run_debate_round.ts`

```
Вход:  roles[], project, context, allArgs[], roundIndex
Выход: { allArgs (расширенный), roundIndex, newArgs[] }
Логика:
  Для каждого агента:
  1. Выбор цели: аргумент с противоположным stance и максимальной strength
  2. Challenge: call_llm → Argument(CHALLENGE, targetArgId)
  3. Автор целевого аргумента → Counter: call_llm → Argument(COUNTER, challengeArgId)
  4. Добавить оба в allArgs
```

### 5.5 `check_convergence.ts`

```
Вход:  allArgs[], round, maxRounds
Выход: { shouldStop: bool, reason: string }
Логика:
  - shouldStop = true если:
    a) round >= maxRounds, ИЛИ
    b) confidence всех агентов стабильна (delta < 0.05) 2 раунда подряд
```

### 5.6 `detect_contradictions.ts`

```
Вход:  allArgs[]
Выход: Contradiction[] { thesis, antithesis, dimension, severity }
Логика:
  - Для каждой пары (APPROVE-agent, REJECT-agent) на одной dimension
  - severity = avg(confidence обоих аргументов)
```

### 5.7 `compute_dimension_scores.ts`

```
Вход:  project
Выход: { trl, mrl, sovereignty, market, finance, risk, team } — все нормализованы [0, 1]
Логика:
  - Формулы нормализации из IC_Committee_Logic.md (Такт 6)
  - Поддержка factorScores (T·S·M·G·E) если есть
```

### 5.8 `aggregate_votes.ts`

```
Вход:  dimScores, roleCatalog, icParams, synthesisArgs[]
Выход: { votes[], aggregatedScore, verdict }
Логика:
  - Для каждой роли: score = Σ(dimScore × weight) + bias + noise → [0, 1]
  - aggregatedScore = Σ(agentScore × agent.weight) / Σ(weights)
  - verdict = score ≥ 0.72 ? APPROVE : score ≥ 0.50 ? DEFER : REJECT
```

### 5.9 `assemble_conditional_decision.ts`

```
Вход:  votes, chairman, dialectic, contradictions, project
Выход: ConditionalDecision { recommendation, contradictions (resolved), conditions[], dealTerms, scenarios }
Логика:
  - Мерж chairman.verdict + dialectic.conditions
  - Маппинг противоречий → conditions с типами и приоритетами
  - Генерация trancheStructure из BLOCKER-условий
  - Генерация 3 сценариев (BASE/OPTIMISTIC/PESSIMISTIC)
```

---

## 6. Порядок реализации

| Волна | Что реализуем | Скрипты | Зависимости |
|-------|--------------|---------|-------------|
| **Wave A** | Базовый pipeline (opening → voting) | `init_session`, `build_role_prompt`, `call_llm`, `parse_role_output`, `run_role_opening`, `compute_dimension_scores`, `aggregate_votes` | Resource: `ic_llm_provider`, `role_catalog.json`, `voting_policy.json` |
| **Wave B** | Дебаты + рефлексия | `run_debate_round`, `check_convergence`, `detect_contradictions`, `build_debate_graph`, `run_role_synthesis` | Wave A |
| **Wave C** | Синтез + решение | `run_chairman_synthesis`, `run_dialectic_synthesis`, `assemble_conditional_decision` | Wave B |
| **Wave D** | Контекст + интеграции | `load_kag_context`, `load_ontology_context`, `load_portfolio_links`, `build_shared_context` | Resource: `ic_kag`, `ic_integram` |
| **Wave E** | Персистентность + approval | `save_to_fst`, `save_to_kag`, `save_portfolio_links`, `human_approval` (suspend) | Resource: `ic_fst`, Wave C+D |
| **Wave F** | Flow assembly | `run_ic_session.flow/flow.yaml` — связать всё вместе | Все скрипты |

---

## 7. Ключевые отличия от монолитной реализации (fund)

| Аспект | fund (монолит) | windfest (Windmill) |
|--------|---------------|---------------------|
| Состояние | In-memory Session + DebateRoom | `results.step_id` — передача между шагами flow |
| Оркестрация | Один FstCommitteeEngine.js (1700 строк) | Flow YAML с дискретными шагами |
| Параллелизм | `Promise.all` в JS | `branchall parallel: true` — нативный |
| Циклы дебатов | `for` loop с break | `whileloopflow` + `stop_after_if` |
| Human approval | Ручной UI-этап | `suspend` с `resume_form` — нативный Windmill |
| LLM fallback | Inline retry в `withResilience()` | `retry.constant.attempts` на уровне модуля |
| Мониторинг | console.log + события | Windmill job logs + run history |
| Версионирование | Git commits | Git sync (`wmill sync push`) + Windmill versioning |

---

## 8. Ресурсы Windmill (создать перед запуском)

```bash
# Создать ресурсы через CLI или UI:
wmill resource create f/ic/llm_provider    --resource-type openai  # API key + endpoint
wmill resource create f/ic/integram_creds  --resource-type object  # { url, token }
wmill resource create f/ic/kag_endpoint    --resource-type object  # { url, apiKey }
wmill resource create f/ic/fst_endpoint    --resource-type object  # { url, apiKey }
```
