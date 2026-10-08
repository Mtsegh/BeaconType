import { describe, expect, it } from 'vitest'
import {
  FEATURE_COUNT,
  ML_CONFIG,
  buildExamples,
  contextFeatures,
  evaluateShadowLog,
  lessonDifficulty,
  predict,
  resolveDriver,
  scoreCandidate,
  shadowPick,
  sigmoid,
  trainModel,
} from './ml'
import type { MlSession, TrainedModel } from './ml'
import type { CoachSnapshot } from './coach'

function session(id: number, overrides: Partial<MlSession> = {}): MlSession {
  return {
    id,
    lessonId: 'home-row',
    netWpm: 30,
    accuracy: 0.96,
    durationMs: 60_000,
    ...overrides,
  }
}

// 'a' is mastered, 'q' is weak: computeWeakness gives low vs high weakness.
const snapshot: CoachSnapshot = {
  keyStats: [
    { key: 'a', attempts: 100, errors: 1, medianIntervalMs: 100, streak: 5 },
    { key: 'q', attempts: 5, errors: 4, medianIntervalMs: 300, streak: 0 },
  ],
  recent: [],
  userMedianIntervalMs: 100,
}

const lessons = [
  { id: 'easy', targetKeys: ['a'] },
  { id: 'hard', targetKeys: ['q'] },
]

describe('sigmoid', () => {
  it('is bounded and centered at 0.5', () => {
    expect(sigmoid(0)).toBeCloseTo(0.5, 10)
    expect(sigmoid(50)).toBeLessThanOrEqual(1)
    expect(sigmoid(-50)).toBeGreaterThanOrEqual(0)
  })

  it('is monotonically increasing', () => {
    expect(sigmoid(-2)).toBeLessThan(sigmoid(-1))
    expect(sigmoid(-1)).toBeLessThan(sigmoid(1))
    expect(sigmoid(1)).toBeLessThan(sigmoid(2))
  })
})

describe('buildExamples', () => {
  it('builds one example per consecutive session pair', () => {
    const examples = buildExamples(lessons, [session(1), session(2), session(3)], snapshot)
    expect(examples).toHaveLength(2)
    expect(examples[0].features).toHaveLength(FEATURE_COUNT)
    expect(examples[0].features.every((f) => Number.isFinite(f))).toBe(true)
  })

  it('needs at least two sessions', () => {
    expect(buildExamples(lessons, [], snapshot)).toHaveLength(0)
    expect(buildExamples(lessons, [session(1)], snapshot)).toHaveLength(0)
  })

  it('labels from the NEXT session meeting the accuracy target', () => {
    const examples = buildExamples(
      lessons,
      [session(1), session(2, { accuracy: 0.95 }), session(3, { accuracy: 0.949 })],
      snapshot,
    )
    expect(examples[0].label).toBe(1) // boundary counts as met
    expect(examples[1].label).toBe(0)
  })

  it('does not depend on session input order', () => {
    const asc = [session(1), session(2, { netWpm: 44, accuracy: 0.9 })]
    const desc = [asc[1], asc[0]]
    expect(buildExamples(lessons, desc, snapshot)).toEqual(buildExamples(lessons, asc, snapshot))
  })
})

describe('lessonDifficulty', () => {
  it('rates a weak-key lesson harder than a mastered-key lesson', () => {
    const hard = lessonDifficulty(lessons[1], snapshot)
    const easy = lessonDifficulty(lessons[0], snapshot)
    expect(hard).toBeGreaterThan(easy)
    expect(easy).toBeGreaterThanOrEqual(0)
    expect(hard).toBeLessThanOrEqual(1)
  })

  it('falls back to neutral for lessons with no tracked keys', () => {
    expect(lessonDifficulty({ id: 'x', targetKeys: ['\u20ac'] }, snapshot)).toBe(0.5)
    expect(lessonDifficulty({ id: 'x', targetKeys: [] }, snapshot)).toBe(0.5)
  })
})

describe('trainModel', () => {
  it('refuses to train below the minimum example count', () => {
    const few = Array.from({ length: ML_CONFIG.minExamples - 1 }, () => ({
      features: [0.9, 1, 0.1, 1, 0.2],
      label: 1 as const,
    }))
    expect(trainModel(few)).toBeNull()
  })

  it('learns a difficulty-driven pattern on separable data', () => {
    const examples = Array.from({ length: 40 }, (_, i) => {
      const difficulty = i < 20 ? 0.1 + i * 0.001 : 0.9 - (i - 20) * 0.001
      return { features: [0.96, 1.05, 0.05, 1.2, difficulty], label: (i < 20 ? 1 : 0) as 0 | 1 }
    })
    const model = trainModel(examples)
    expect(model).not.toBeNull()
    const low = scoreCandidate(model as TrainedModel, [0.96, 1.05, 0.05, 1.2], 0.1)
    const high = scoreCandidate(model as TrainedModel, [0.96, 1.05, 0.05, 1.2], 0.9)
    expect(low).toBeGreaterThan(high)
    expect(low).toBeGreaterThan(0.7)
    expect(high).toBeLessThan(0.3)
  })

  it('is deterministic', () => {
    const examples = Array.from({ length: 12 }, (_, i) => ({
      features: [0.9 + i * 0.001, 1, 0.1, 1, i / 12],
      label: (i % 2) as 0 | 1,
    }))
    const a = trainModel(examples)
    const b = trainModel(examples)
    expect(a).toEqual(b)
  })
})

describe('predict', () => {
  it('always returns a probability', () => {
    const model: TrainedModel = { mean: [0, 0, 0, 0, 0], std: [1, 1, 1, 1, 1], weights: [3, -2, 1, 0.5, 4], bias: -1 }
    const p = predict(model, [1, 1, 1, 1, 1])
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(1)
  })
})

describe('contextFeatures', () => {
  it('is null without sessions and otherwise returns the context slice', () => {
    expect(contextFeatures([])).toBeNull()
    const ctx = contextFeatures([session(1, { netWpm: 45, accuracy: 0.9, durationMs: 120_000 })])
    expect(ctx).not.toBeNull()
    expect(ctx as number[]).toHaveLength(FEATURE_COUNT - 1)
    expect((ctx as number[])[0]).toBeCloseTo(0.9) // accuracy
    expect((ctx as number[])[3]).toBeCloseTo(2) // minutes
  })
})

describe('shadowPick', () => {
  it('picks the candidate whose predicted success is closest to the target', () => {
    // weights on difficulty only: sigmoid(6·difficulty)
    const model: TrainedModel = { mean: [0, 0, 0, 0, 0], std: [1, 1, 1, 1, 1], weights: [0, 0, 0, 0, 6], bias: 0 }
    const pick = shadowPick(model, [0, 0, 0, 0], lessons, snapshot)
    expect(pick).not.toBeNull()
    expect(lessons.map((l) => l.id)).toContain(pick?.lessonId)
    expect(pick?.p).toBeGreaterThan(0)
    expect(pick?.p).toBeLessThan(1)
  })

  it('returns null with no candidates', () => {
    const model: TrainedModel = { mean: [0, 0, 0, 0, 0], std: [1, 1, 1, 1, 1], weights: [0, 0, 0, 0, 1], bias: 0 }
    expect(shadowPick(model, [0, 0, 0, 0], [], snapshot)).toBeNull()
  })
})

describe('resolveDriver', () => {
  const pick = { lessonId: 'hard', p: 0.9 }
  const ruleP = 0.7

  it('keeps the rules in charge when adaptive is off', () => {
    expect(resolveDriver({ adaptiveOn: false, ruleLessonId: 'easy', ruleP, modelPick: pick })).toBe('rules')
  })

  it('keeps the rules when the model agrees with them', () => {
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'hard', ruleP, modelPick: pick })).toBe('rules')
  })

  it('keeps the rules when the model lacks confidence or margin', () => {
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'easy', ruleP, modelPick: { lessonId: 'hard', p: 0.65 } })).toBe('rules')
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'easy', ruleP: 0.88, modelPick: pick })).toBe('rules')
  })

  it('hands over only with a confident, clearly different pick', () => {
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'easy', ruleP, modelPick: pick })).toBe('model')
  })

  it('stays on rules when there is no model or no rule prediction', () => {
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'easy', ruleP, modelPick: null })).toBe('rules')
    expect(resolveDriver({ adaptiveOn: true, ruleLessonId: 'easy', ruleP: null, modelPick: pick })).toBe('rules')
  })
})

describe('evaluateShadowLog', () => {
  const sessions = [
    session(1, { accuracy: 0.9 }),
    session(2, { accuracy: 0.96 }),
    session(3, { accuracy: 0.9 }),
  ]

  it('scores outcomes, agreement and Brier against the next session', () => {
    const result = evaluateShadowLog(
      [
        { sessionId: 1, ruleLessonId: 'a', modelLessonId: 'a', modelRuleP: 0.8 },
        { sessionId: 2, ruleLessonId: 'b', modelLessonId: 'c', modelRuleP: 0.6 },
      ],
      sessions,
    )
    expect(result.rows[0].outcome).toBe(true) // session 2 hit 0.96
    expect(result.rows[1].outcome).toBe(false) // session 3 missed at 0.90
    expect(result.agreementRate).toBeCloseTo(0.5, 10)
    expect(result.withOutcome).toBe(2)
    expect(result.brier).toBeCloseTo(((0.8 - 1) ** 2 + (0.6 - 0) ** 2) / 2, 10)
  })

  it('marks rows without a following session as pending', () => {
    const result = evaluateShadowLog(
      [{ sessionId: 3, ruleLessonId: 'a', modelLessonId: null, modelRuleP: null }],
      sessions,
    )
    expect(result.rows[0].outcome).toBeNull()
    expect(result.withOutcome).toBe(0)
    expect(result.brier).toBeNull()
    expect(result.agreementRate).toBeNull()
  })
})
