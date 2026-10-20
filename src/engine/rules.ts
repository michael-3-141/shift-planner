import type { Constraint, ConstraintKind, Rules } from './types'

export type ConstraintOf<K extends ConstraintKind> = Extract<Constraint, { kind: K }>

/** The constraint of this kind, whether enabled or not. */
export function findConstraint<K extends ConstraintKind>(rules: Rules, kind: K): ConstraintOf<K> | undefined {
  return rules.constraints.find((c): c is ConstraintOf<K> => c.kind === kind)
}

/** The constraint of this kind if it is enabled, which is when planning applies it. */
export function activeConstraint<K extends ConstraintKind>(rules: Rules, kind: K): ConstraintOf<K> | undefined {
  const c = findConstraint(rules, kind)
  return c?.enabled ? c : undefined
}

/** A constraint planning can't do without; workspaces always have these. */
export function requiredConstraint<K extends 'maxShift' | 'minRest'>(rules: Rules, kind: K): ConstraintOf<K> {
  const c = findConstraint(rules, kind)
  if (!c) throw new Error(`The rules have no ${kind} constraint`)
  return c
}

/** Replaces the constraint of the same kind, or adds it. */
export function withConstraint(rules: Rules, constraint: Constraint): Rules {
  const exists = rules.constraints.some(c => c.kind === constraint.kind)
  return { ...rules, constraints: exists ? rules.constraints.map(c => (c.kind === constraint.kind ? constraint : c)) : [...rules.constraints, constraint] }
}
