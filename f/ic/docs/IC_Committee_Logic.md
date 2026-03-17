# Логика агентского инвесткомитета (верхний уровень)

> Источник: `github.com/unidel2035/fund`
> Система: FST NTI Investment Committee — мультиагентный оркестратор принятия инвестиционных решений

---

## Участники (Role-Workers)

| ID | Роль | Фокус | Bias | Вес |
|----|------|-------|------|-----|
| `tech` | Технический аналитик | TRL, MRL, производство, IP | neutral | 0.18 |
| `finance` | Финансовый аналитик | IRR, unit-экономика, runway | skeptic | 0.20 |
| `sovereignty` | Эксперт суверенности | Импортозамещение, локализация | optimist | 0.16 |
| `risk` | Риск-менеджер | PMBOK-реестр, регуляторные риски | pessimist | 0.18 |
| `portfolio` | Стратег портфеля | Синергии, стратегия НТИ | neutral | 0.14 |
| `devil` | Критический аналитик | Слабые места, альтернативные интерпретации | pessimist | 0.14 |
| `monte_carlo` | Квантовый риск-аналитик | Стохастическое моделирование (1000 симуляций) | — | 0.10 |
| `real_options` | Аналитик реальных опционов | Биномиальное дерево, гибкость | — | 0.09 |
| `market_timing` | Аналитик рыночного цикла | Цикл Говарда Маркса, катализаторы | — | 0.09 |
| `bayesian` | Байесовский аналитик | Априорные вероятности, обновление по Байесу | — | 0.09 |
| `power_score` | Аналитик стратегического моата | 7 Powers (Helmer), power law | — | 0.09 |
| `game_theory` | Теоретик игр | Нэш, Шепли, мета-комментарий | — | 0.08 |
| `chairman` | Председатель комитета | Финальный вердикт, взвешенный скоринг | — | мета |
| `dialectic` | Диалектик | Тезис-антитезис, T-схема, условия сделки | — | мета |

---

## Жизненный цикл сессии (фазы)

```
IDLE → LOADING → PRIMARY_POSITIONS → CROSS_DEBATE
     → REFLECTION → FINAL_POSITIONS → VOTING
     → SYNTHESIS → HUMAN_APPROVAL → CONCLUDED
```

---

## Единый формат такта

```
### Такт N — Название
- Фаза:       к какой фазе жизненного цикла относится
- Исполнители: кто выполняет работу
- Вход:        что получает (сущность → параметры)
- Действие:    что делает
- Выход:       что отдаёт (сущность → параметры)
- Переход:     куда передаёт результат
```

---

## Такты работы инвесткомитета

---

### Такт 0 — Инициализация сессии

- **Фаза:** `IDLE → LOADING`
- **Исполнители:** Система (оркестратор)
- **Вход:**
  - `Project` → `{ title, subFund, trl, mrl, irr, marketSize, teamStrength, stage, factorScores }`
  - `ICParams` → `{ approveThreshold (72%), deferThreshold (50%), maxIter (5), votingMode }`
  - `AgentRegistry` → список из 14 агентов с весами и bias
- **Действие:**
  1. Создаёт объект `Session` с уникальным ID
  2. Загружает агентов из `AgentRegistry`
  3. Загружает параметры IC из Integram (`icParams`)
  4. Инициализирует `DebateRoom` (in-memory pub/sub шина)
  5. Сбрасывает кэш токенов (`resetLoopTokenCache`)
- **Выход:**
  - `Session` → `{ id, phase: 'LOADING', agents[], arguments: [], votes: [], icParams, debateRoom }`
- **Переход:** → Такт 1

---

### Такт 1 — Загрузка контекста

- **Фаза:** `LOADING`
- **Исполнители:** Все агенты (параллельно, со смещением 400ms)
- **Вход:**
  - `Session` → `{ id, phase: 'LOADING' }`
  - `Project` → идентификатор проекта для поиска контекста
- **Действие:**
  1. Каждый агент "читает документы проекта" (стаггированный запуск)
  2. Параллельно загружаются:
     - `KAG Context` — прошлые решения ИК по аналогичным проектам (`fetchKagContext`)
     - `Ontology Context` — 50 ключевых концептов предметной области (`fetchOntologyContext`)
     - `Portfolio Links` — пересечения с портфельными компаниями (`fstLinksService`)
  3. Сессия тегируется доменными концептами
  4. Агенты циклически выводят "фразы размышления" (3–4 сек каждая)
- **Выход:**
  - `KAGContext` → `{ priorDecisions[], similarProjects[] }`
  - `OntologyContext` → `{ concepts[], relations[] }`
  - `PortfolioOverlap` → `{ overlappingCompanies[], synergies[] }`
  - Событие: `AgentAnalysisStarted`, `AgentAnalysisConcluded`
- **Переход:** → Такт 2

---

### Такт 2 — Первичные позиции (Opening)

- **Фаза:** `PRIMARY_POSITIONS`
- **Исполнители:** Каждый агент (последовательно)
- **Вход:**
  - `Project` → `{ title, subFund, trl, mrl, irr, marketSize, teamStrength, stage }`
  - `KAGContext` → прошлые решения
  - `Agent.systemPrompt` → ролевая инструкция (уникальная для каждого агента)
  - `AgentFocus` → случайный вариант фокуса ("особое внимание — ...")
- **Действие:**
  1. Для каждого агента вызывается `generateArgumentAI(agent, 'OPENING', project, [], null, kagContext)`
  2. LLM генерирует позицию с учётом ролевого промпта
  3. Ответ парсится из JSON: `parseAgentResponse(llmOutput)`
  4. Создаётся аргумент типа `OPENING`
  5. Аргумент публикуется в `session.arguments[]` и в `DebateRoom`
- **Выход (на каждого агента):**
  - `Argument(OPENING)` →
    ```
    { id, agentId, type: 'OPENING',
      text: "2-3 предложения",
      dimension: 'trl|sovereignty|finance|risk|market|team',
      confidence: 0.0–1.0,
      stance: 'APPROVE|DEFER|REJECT',
      targetArgId: null,
      timestamp, strength: 0.5–1.0 }
    ```
  - Событие: `ArgumentPublished`
- **Переход:** → Такт 3

---

### Такт 3 — Перекрёстные дебаты (Cross-Debate)

- **Фаза:** `CROSS_DEBATE`
- **Исполнители:** Все агенты (до 5 раундов)
- **Вход:**
  - `session.arguments[]` → все ранее опубликованные аргументы
  - `DebateRoom` → последние 6 сообщений (формат: `[agent]: text`)
  - `Agent.scoringWeights` → для выбора целей атаки
- **Действие:**
  Цикл раундов (1–5), в каждом раунде для каждого агента:
  1. **Выбор цели:** агент выбирает аргумент оппонента для атаки (взвешенно по активности + силе аргумента)
  2. **Challenge:** `generateArgumentAI(agent, 'CHALLENGE', project, prevArgs, targetArgId, kagContext)`
     - Атакует слабое место в аргументе оппонента
  3. **Counter:** целевой агент отвечает контр-аргументом:
     `generateArgumentAI(targetAgent, 'COUNTER', project, prevArgs, challengeArgId, kagContext)`
  4. Все аргументы публикуются в `DebateRoom`
  5. **(Опционально, AgentLoop):** если `session.useAgentLoop = true`:
     - Агент выполняет до 5 итераций мультишагового workflow:
       `read_room → query_data → tool_calls → publish`
     - Доступные инструменты: `calc_irr`, `calc_npv`, `calc_monte_carlo`, `calc_power_score`, `calc_bayesian`, `web_search`, `memory_search`, `exec_code`, `search_precedents`
  6. **Проверка сходимости:** если confidence всех агентов стабильна 2 раунда подряд → досрочный выход
- **Выход (на каждый раунд):**
  - `Argument(CHALLENGE)` → `{ ..., type: 'CHALLENGE', targetArgId: <id атакуемого аргумента> }`
  - `Argument(COUNTER)` → `{ ..., type: 'COUNTER', targetArgId: <id challenge-аргумента> }`
  - Событие: `ArgumentPublished`, `AgentLoopProgress` (если инструменты)
- **Переход:** → Такт 4

---

### Такт 4 — Рефлексия

- **Фаза:** `REFLECTION`
- **Исполнители:** Система (аналитические функции)
- **Вход:**
  - `session.arguments[]` → полный массив аргументов всех раундов
  - `session.events[]` → события сессии
- **Действие:**
  1. **Детекция противоречий:** `detectContradictions(arguments)`
     - Находит пары (APPROVE-агент, REJECT-агент) по одной и той же dimension
     - Проверяет явные семантические конфликты (`contradicts`-связи)
     - Вычисляет severity как среднюю силу Тулмина
  2. **Построение IBIS-графа:** `buildIBISGraph(arguments)`
     - Issues → Positions → Arguments (иерархия проблем)
  3. **Построение графа дебатов:** `buildDebateGraph(events)`
     - Узлы: аргументы; рёбра: отношения (challenges, supports, contradicts, synthesizes)
  4. **Дрейф убеждений:** `calculateBeliefDrift(arguments)`
     - Для каждого агента: изменение confidence от раунда к раунду
  5. **Аннотация аргументов** онтологическими связями
- **Выход:**
  - `Contradiction[]` →
    ```
    { thesis: { agentId, argId, claim, stance: 'APPROVE' },
      antithesis: { agentId, argId, claim, stance: 'REJECT' },
      dimension, severity }
    ```
  - `IBISGraph` → `{ issues[] → positions[] → arguments[] }`
  - `DebateGraph` → `{ nodes[], edges[] }`
  - `BeliefDrift[]` → `{ agentId, rounds[], confidenceDeltas[] }`
  - Событие: `ContradictionDetected`, `IBISGraphReady`
- **Переход:** → Такт 5

---

### Такт 5 — Финальные позиции (Synthesis)

- **Фаза:** `FINAL_POSITIONS`
- **Исполнители:** Каждый агент (последовательно)
- **Вход:**
  - `session.arguments[]` → полная история дебатов
  - `Contradiction[]` → выявленные противоречия
  - `DebateGraph` → граф связей аргументов
  - `KAGContext` → прецеденты
- **Действие:**
  1. Для каждого агента: `generateArgumentAI(agent, 'SYNTHESIS', project, allArgs, null, kagContext)`
  2. Агент видит всю историю дебатов и формулирует итоговую позицию
  3. Учитывает сильнейшие контр-аргументы оппонентов
  4. Обновляет confidence с учётом хода дебатов
- **Выход (на каждого агента):**
  - `Argument(SYNTHESIS)` →
    ```
    { ..., type: 'SYNTHESIS',
      text: "итоговая позиция с учётом дебатов",
      confidence: обновлённая,
      stance: 'APPROVE|DEFER|REJECT',
      conditions: ["условие 1", "условие 2"] }
    ```
  - Событие: `ArgumentPublished`
- **Переход:** → Такт 6

---

### Такт 6 — Голосование

- **Фаза:** `VOTING`
- **Исполнители:** Система (скоринг) + каждый агент (голос)
- **Вход:**
  - `Project` → метрики проекта (trl, mrl, irr, marketSize, teamStrength, riskFactors)
  - `Agent[]` → `{ scoringWeights, bias, weight }`
  - `ICParams` → `{ approveThreshold (72%), deferThreshold (50%), votingMode }`
- **Действие:**
  1. **Вычисление скоров по измерениям** (`computeDimScores`):
     ```
     trl:         normalize(project.trl, 1–9)
     mrl:         normalize(project.mrl, 1–10)
     sovereignty: normalize(sovereigntyScore, 0–9)
     market:      normalize(log(marketSize), 0–5)
     finance:     normalize(projectedIRR, 0.10–0.60)
     risk:        1 - normalize(riskFactors)
     team:        project.teamStrength (0–1)
     ```
  2. **Скор каждого агента** (`agentScore`):
     ```
     score = Σ(dimScores[dim] × agent.scoringWeights[dim])
           + bias_adjustment (-0.05 pessimist | +0.05 optimist | 0 neutral)
           + random_noise (±0.03)
     → clamped [0, 1]
     ```
  3. **Агрегация** (`aggregateScore`):
     ```
     weightedScore = Σ(agentScore × agent.weight) / Σ(agent.weight)
     ```
  4. **Вердикт** (`scoreToVerdict`):
     ```
     score ≥ 0.72 → APPROVE
     score ≥ 0.50 → DEFER
     score < 0.50 → REJECT
     ```
  5. Каждый агент фиксирует голос: `{ agentId, verdict, confidence, score }`
- **Выход:**
  - `Vote[]` → `{ agentId, verdict, confidence, score }` × N агентов
  - `AggregatedScore` → `float [0, 1]`
  - `Verdict` → `'APPROVE' | 'DEFER' | 'REJECT'`
  - Событие: `VoteCast`, `FinalVerdictReady`
- **Переход:** → Такт 7

---

### Такт 7 — Синтез решения

- **Фаза:** `SYNTHESIS`
- **Исполнители:** `chairman` + `dialectic` (мета-агенты)
- **Вход:**
  - `Verdict` → итоговый вердикт
  - `Vote[]` → голоса всех агентов
  - `Contradiction[]` → выявленные противоречия (уточнённый список)
  - `session.arguments[]` → полная история дебатов
  - `Project` → метрики проекта
- **Действие:**
  1. **Chairman** читает всю комнату, формирует взвешенный скор
  2. **Dialectic** находит пары тезис-антитезис, предлагает T-схему синтеза
  3. **Повторная детекция противоречий:** `detectContradictions(arguments)` → уточнённый список
  4. **Генерация условий из противоречий:** `deriveConditionsFromContradictions(contradictions)`
     - Каждое противоречие → условие сделки с типом и приоритетом
  5. **Сборка условного решения:** `assembleConditionalDecision({ decision, contradictions, conditions, project })`
  6. **Генерация рекомендаций:** `generateRecommendations(decision, project)`
     - Каждый агент выдаёт рекомендации с приоритетом, метрикой, дедлайном, владельцем
  7. *(если DEFER)* — `applyRevision(project, recommendations)` → корректировка метрик проекта
- **Выход:**
  - `ConditionalDecision` →
    ```
    { recommendation: 'CONDITIONAL_APPROVE|APPROVE|DEFER|REJECT',
      contradictions: [
        { dimension, thesis, antithesis, status: 'RESOLVED_BY_CONDITION' }
      ],
      conditions: [
        { type: 'MILESTONE|FINANCIAL|GOVERNANCE|REPORTING|TRANCHE|SOVEREIGNTY|TEAM|EXIT',
          proposedBy: agentId,
          priority: 'BLOCKER|HIGH|MEDIUM|LOW',
          text: "описание условия",
          metric, threshold, deadline,
          dealImpact: { trancheFraction } }
      ],
      dealTerms: {
        trancheStructure: [
          { label: 'Tranche A', fraction: 0.3, trigger: 'Signing' },
          { label: 'Tranche B', fraction: 0.7, trigger: 'TRL≥6 + audit' }
        ]
      },
      scenarios: {
        BASE:        { probability: 0.50, irr: 28, exitYear: 5 },
        OPTIMISTIC:  { probability: 0.25, irr: 36, exitYear: 4 },
        PESSIMISTIC: { probability: 0.25, irr: 19, exitYear: 7 }
      } }
    ```
  - `Recommendation[]` →
    ```
    { agentId, text, priority: 'CRITICAL|HIGH|MEDIUM|LOW',
      metric, delta, effort: 'LOW|MEDIUM|HIGH',
      weeks, owner: 'CTO|CFO|CEO' }
    ```
  - Событие: `ConditionalDecisionReady`, `SessionConcluded`
- **Переход:** → Такт 8

---

### Такт 8 — Одобрение человеком

- **Фаза:** `HUMAN_APPROVAL`
- **Исполнители:** Люди (Председатель + 2 GP-члена комитета)
- **Вход:**
  - `ConditionalDecision` → полное условное решение
  - `Recommendation[]` → рекомендации агентов
  - `DebateGraph` → визуализация хода дебатов
  - `session.arguments[]` → для drill-down в логику
- **Действие:**
  1. Человеческие члены комитета ревьюят решение
  2. Могут одобрить или запросить доработку
  3. При одобрении — запускается фаза рекомендаций
  4. При отклонении — возможен возврат к ревизии
- **Выход:**
  - `HumanDecision` → `{ approved: bool, comments?, revisionRequested? }`
  - Событие: `HumanApproved` или возврат к ревизии
- **Переход:** → Такт 9 (если одобрено)

---

### Такт 9 — Фиксация решения

- **Фаза:** `CONCLUDED`
- **Исполнители:** Система
- **Вход:**
  - `ConditionalDecision` → финальное решение
  - `HumanDecision` → подтверждение
  - `Session` → полная сессия со всеми артефактами
- **Действие:**
  1. `saveDecisionToFst()` — POST решения в систему FST
  2. `recordSessionDecision(session)` — запись в `fstLinksService` (портфельные связи)
  3. `saveSessionToKag(session)` — экспорт дебатов в базу знаний KAG (для будущих прецедентов)
  4. Создание контрактных узлов (если требуется `NODE_NEGOTIATION`)
- **Выход:**
  - `PersistedDecision` → запись в FST-систему
  - `KAGRecord` → сессия как прецедент для будущих ИК
  - `PortfolioLink` → связь проекта с портфелем фонда
  - Событие: `DecisionPersisted`
- **Переход:** Конец сессии

---

## Сводная диаграмма потока данных

```
Такт 0: Session ────────────────────────────────────────────────────────────────►
  │  Project + ICParams + AgentRegistry → Session{agents, debateRoom}
  ▼
Такт 1: Context ────────────────────────────────────────────────────────────────►
  │  Session → KAGContext + OntologyContext + PortfolioOverlap
  ▼
Такт 2: Opening ────────────────────────────────────────────────────────────────►
  │  Project + KAGContext + AgentPrompt → Argument(OPENING) × N агентов
  ▼
Такт 3: Debate ─────────────────────────────────────────────────────────────────►
  │  Arguments + DebateRoom → Argument(CHALLENGE) + Argument(COUNTER) × раунды
  ▼
Такт 4: Reflection ─────────────────────────────────────────────────────────────►
  │  Arguments → Contradiction[] + IBISGraph + DebateGraph + BeliefDrift[]
  ▼
Такт 5: Final ──────────────────────────────────────────────────────────────────►
  │  AllArguments + Contradictions → Argument(SYNTHESIS) × N агентов
  ▼
Такт 6: Voting ─────────────────────────────────────────────────────────────────►
  │  Project + AgentWeights + ICParams → Vote[] → AggregatedScore → Verdict
  ▼
Такт 7: Synthesis ──────────────────────────────────────────────────────────────►
  │  Verdict + Contradictions + Arguments → ConditionalDecision + Recommendations
  ▼
Такт 8: Human ──────────────────────────────────────────────────────────────────►
  │  ConditionalDecision → HumanDecision{approved}
  ▼
Такт 9: Persist ────────────────────────────────────────────────────────────────►
     Session → FST + KAG + PortfolioLinks
```

---

## Типы аргументов (Argument Types)

| Тип | Когда возникает | Назначение |
|-----|-----------------|------------|
| `OPENING` | Такт 2 | Первичная позиция агента |
| `CHALLENGE` | Такт 3 | Атака на слабое место оппонента |
| `COUNTER` | Такт 3 | Защитный ответ на challenge |
| `SUPPORT` | Такт 3 | Поддержка позиции коллеги |
| `SYNTHESIS` | Такт 5 | Итоговая позиция с учётом дебатов |
| `QUESTION` | Такт 3 (Etap 2) | Запрос уточнения |
| `COMMITMENT` | Такт 3 (Etap 2) | Условное обязательство |
| `CONCESSION` | Такт 3 (Etap 2) | Частичное согласие |
| `RETRACTION` | Такт 3 (Etap 2) | Отзыв аргумента |

## Типы условий сделки (Condition Types)

| Тип | Описание |
|-----|----------|
| `MILESTONE` | Технологический рубеж (TRL, MRL, выручка) |
| `FINANCIAL` | Финансовый порог (IRR floor, burn rate cap) |
| `GOVERNANCE` | Вето совета, наблюдатель, consent rights |
| `REPORTING` | Периодичность отчётов, аудит KPI |
| `TRANCHE` | Этапное финансирование (Транш A если X, Транш B если Y+Z) |
| `SOVEREIGNTY` | Процент локализации, сертификация, экспортный контроль |
| `TEAM` | Найм, замена, вестинг |
| `EXIT` | Tag-along, drag-along, ценообразование опционов |

## Анатомия аргумента по Тулмину

| Поле | Описание | Пример |
|------|----------|--------|
| `claim` | Главное утверждение | "TRL достаточен для инвестирования" |
| `data` | Фактическое основание | "TRL=6, прототип протестирован" |
| `warrant` | Логическая связка | "TRL≥6 позволяет переход к производству" |
| `backing` | Авторитет/стандарт | "Стандарт NASA, прецедент: Aeronet-2022" |
| `qualifier` | Степень уверенности | 0.0–1.0 ("вероятно" vs "необходимо") |
| `rebuttal` | Известные исключения | "Если команда не имеет опыта масштабирования" |
