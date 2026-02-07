/**
 * Constraint Satisfaction Problem (CSP) Engine
 * Implements arc consistency (AC-3) and backtracking search with constraint propagation
 *
 * This engine provides the algorithmic foundation for schedule generation.
 * It uses domain reduction and constraint propagation to efficiently find valid schedules.
 */

import { SHIFTS } from '../config/defaults.js';

/**
 * Variable class representing a scheduling decision (engineer + date)
 */
export class Variable {
  constructor(id, domain = []) {
    this.id = id;
    this.domain = [...domain];
    this.assigned = null;
  }

  assign(value) {
    this.assigned = value;
  }

  unassign() {
    this.assigned = null;
  }

  isAssigned() {
    return this.assigned !== null;
  }

  getDomainSize() {
    return this.domain.length;
  }

  removeFromDomain(value) {
    const index = this.domain.indexOf(value);
    if (index > -1) {
      this.domain.splice(index, 1);
      return true;
    }
    return false;
  }

  clone() {
    const v = new Variable(this.id, this.domain);
    v.assigned = this.assigned;
    return v;
  }
}

/**
 * Constraint class for defining relationships between variables
 */
export class Constraint {
  constructor(name, variables, satisfiedFn, priority = 'hard') {
    this.name = name;
    this.variables = variables; // Array of variable IDs involved
    this.isSatisfied = satisfiedFn; // Function(assignment) => boolean
    this.priority = priority; // 'hard' (must satisfy) or 'soft' (prefer)
    this.weight = priority === 'hard' ? 1000 : 1;
  }

  /**
   * Check if this constraint is satisfied by the given assignment
   */
  check(assignment) {
    return this.isSatisfied(assignment);
  }

  /**
   * Get variables involved in this constraint
   */
  getScope() {
    return this.variables;
  }
}

/**
 * Main CSP Solver using AC-3 and backtracking
 */
export class ConstraintEngine {
  constructor() {
    this.variables = new Map(); // id -> Variable
    this.constraints = [];
    this.binaryConstraints = new Map(); // For arc consistency
    this.stats = {
      backtracks: 0,
      propagations: 0,
      assignments: 0
    };
  }

  /**
   * Add a variable to the problem
   */
  addVariable(id, domain) {
    this.variables.set(id, new Variable(id, domain));
  }

  /**
   * Add a constraint to the problem
   */
  addConstraint(constraint) {
    this.constraints.push(constraint);

    // Index binary constraints for arc consistency
    if (constraint.variables.length === 2) {
      const [v1, v2] = constraint.variables;
      if (!this.binaryConstraints.has(v1)) {
        this.binaryConstraints.set(v1, new Map());
      }
      if (!this.binaryConstraints.get(v1).has(v2)) {
        this.binaryConstraints.get(v1).set(v2, []);
      }
      this.binaryConstraints.get(v1).get(v2).push(constraint);

      // Bidirectional
      if (!this.binaryConstraints.has(v2)) {
        this.binaryConstraints.set(v2, new Map());
      }
      if (!this.binaryConstraints.get(v2).has(v1)) {
        this.binaryConstraints.get(v2).set(v1, []);
      }
      this.binaryConstraints.get(v2).get(v1).push(constraint);
    }
  }

  /**
   * AC-3 Algorithm for arc consistency
   * Reduces domains by removing values that can't satisfy constraints
   */
  ac3(initialArcs = null) {
    const queue = [];

    // Initialize queue with all arcs
    if (initialArcs) {
      queue.push(...initialArcs);
    } else {
      for (const [v1, neighbors] of this.binaryConstraints) {
        for (const v2 of neighbors.keys()) {
          queue.push([v1, v2]);
        }
      }
    }

    while (queue.length > 0) {
      const [xi, xj] = queue.shift();
      this.stats.propagations++;

      if (this.revise(xi, xj)) {
        const variable = this.variables.get(xi);
        if (variable.domain.length === 0) {
          return false; // Domain wipeout - no solution
        }

        // Add all arcs (xk, xi) where xk is a neighbor of xi (except xj)
        const neighbors = this.binaryConstraints.get(xi);
        if (neighbors) {
          for (const xk of neighbors.keys()) {
            if (xk !== xj) {
              queue.push([xk, xi]);
            }
          }
        }
      }
    }

    return true;
  }

  /**
   * Revise domain of xi based on constraint with xj
   */
  revise(xi, xj) {
    let revised = false;
    const varI = this.variables.get(xi);
    const varJ = this.variables.get(xj);

    if (!varI || !varJ) return false;

    const constraints = this.binaryConstraints.get(xi)?.get(xj) || [];

    // For each value in xi's domain
    const toRemove = [];
    for (const valueI of varI.domain) {
      // Check if there exists at least one value in xj's domain
      // that satisfies all constraints between xi and xj
      let satisfied = false;

      for (const valueJ of varJ.domain) {
        const assignment = {
          [xi]: valueI,
          [xj]: valueJ
        };

        // Check all constraints
        const allSatisfied = constraints.every(c => c.check(assignment));
        if (allSatisfied) {
          satisfied = true;
          break;
        }
      }

      if (!satisfied) {
        toRemove.push(valueI);
        revised = true;
      }
    }

    toRemove.forEach(v => varI.removeFromDomain(v));
    return revised;
  }

  /**
   * Get current assignment as object
   */
  getAssignment() {
    const assignment = {};
    for (const [id, variable] of this.variables) {
      if (variable.isAssigned()) {
        assignment[id] = variable.assigned;
      }
    }
    return assignment;
  }

  /**
   * Check if all hard constraints are satisfied
   */
  isConsistent(assignment) {
    for (const constraint of this.constraints) {
      if (constraint.priority === 'hard') {
        // Only check constraints where all variables are assigned
        const allAssigned = constraint.variables.every(v => assignment[v] !== undefined);
        if (allAssigned && !constraint.check(assignment)) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Check if all variables are assigned
   */
  isComplete() {
    for (const variable of this.variables.values()) {
      if (!variable.isAssigned()) {
        return false;
      }
    }
    return true;
  }

  /**
   * Select next unassigned variable using MRV (Minimum Remaining Values) heuristic
   */
  selectUnassignedVariable() {
    let minVariable = null;
    let minSize = Infinity;

    for (const variable of this.variables.values()) {
      if (!variable.isAssigned() && variable.domain.length < minSize) {
        minSize = variable.domain.length;
        minVariable = variable;
      }
    }

    return minVariable;
  }

  /**
   * Order domain values using Least Constraining Value heuristic
   */
  orderDomainValues(variable) {
    // Simple implementation: order by how many constraints are satisfied
    const values = [...variable.domain];

    // Sort by least constraining (leaves most options open for neighbors)
    values.sort((a, b) => {
      const aScore = this.countConflicts(variable.id, a);
      const bScore = this.countConflicts(variable.id, b);
      return aScore - bScore;
    });

    return values;
  }

  /**
   * Count how many domain values in neighboring variables would be eliminated
   */
  countConflicts(variableId, value) {
    let conflicts = 0;
    const assignment = this.getAssignment();
    assignment[variableId] = value;

    const neighbors = this.binaryConstraints.get(variableId);
    if (neighbors) {
      for (const [neighborId, constraints] of neighbors) {
        const neighbor = this.variables.get(neighborId);
        if (neighbor && !neighbor.isAssigned()) {
          for (const neighborValue of neighbor.domain) {
            const testAssignment = { ...assignment, [neighborId]: neighborValue };
            const anyFails = constraints.some(c => !c.check(testAssignment));
            if (anyFails) {
              conflicts++;
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Backtracking search with constraint propagation
   */
  solve(maxBacktracks = 10000) {
    this.stats = { backtracks: 0, propagations: 0, assignments: 0 };

    // Initial arc consistency
    if (!this.ac3()) {
      return { success: false, reason: 'Initial AC-3 failed', stats: this.stats };
    }

    const result = this.backtrack(maxBacktracks);

    if (result) {
      return {
        success: true,
        assignment: this.getAssignment(),
        stats: this.stats
      };
    }

    return {
      success: false,
      reason: 'Backtracking exhausted',
      partialAssignment: this.getAssignment(),
      stats: this.stats
    };
  }

  /**
   * Recursive backtracking
   */
  backtrack(maxBacktracks) {
    if (this.stats.backtracks > maxBacktracks) {
      return false;
    }

    if (this.isComplete()) {
      return true;
    }

    const variable = this.selectUnassignedVariable();
    if (!variable) {
      return false;
    }

    const orderedValues = this.orderDomainValues(variable);

    for (const value of orderedValues) {
      this.stats.assignments++;
      variable.assign(value);

      const assignment = this.getAssignment();
      if (this.isConsistent(assignment)) {
        // Save domains for restoration
        const savedDomains = new Map();
        for (const [id, v] of this.variables) {
          savedDomains.set(id, [...v.domain]);
        }

        // Propagate constraints
        const arcs = [];
        const neighbors = this.binaryConstraints.get(variable.id);
        if (neighbors) {
          for (const neighborId of neighbors.keys()) {
            arcs.push([neighborId, variable.id]);
          }
        }

        if (this.ac3(arcs) && this.backtrack(maxBacktracks)) {
          return true;
        }

        // Restore domains
        for (const [id, domain] of savedDomains) {
          this.variables.get(id).domain = domain;
        }
      }

      variable.unassign();
      this.stats.backtracks++;
    }

    return false;
  }

  /**
   * Calculate soft constraint satisfaction score
   */
  calculateScore(assignment) {
    let score = 0;
    let maxScore = 0;

    for (const constraint of this.constraints) {
      if (constraint.priority === 'soft') {
        maxScore += constraint.weight;
        if (constraint.check(assignment)) {
          score += constraint.weight;
        }
      }
    }

    return maxScore > 0 ? score / maxScore : 1;
  }

  /**
   * Get unsatisfied constraints for debugging
   */
  getUnsatisfiedConstraints(assignment) {
    const unsatisfied = [];

    for (const constraint of this.constraints) {
      const allAssigned = constraint.variables.every(v => assignment[v] !== undefined);
      if (allAssigned && !constraint.check(assignment)) {
        unsatisfied.push({
          name: constraint.name,
          priority: constraint.priority,
          variables: constraint.variables
        });
      }
    }

    return unsatisfied;
  }

  /**
   * Reset the engine for a new problem
   */
  reset() {
    this.variables.clear();
    this.constraints = [];
    this.binaryConstraints.clear();
    this.stats = { backtracks: 0, propagations: 0, assignments: 0 };
  }
}

export default ConstraintEngine;
