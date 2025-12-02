import { GameState, AIAction, Unit, UnitType, Direction, SupportLine } from '../types';
import { 
  GRID_SIZE, isValidMove, canAttack, getCombatOutcome, calculateBaseStrength, getUnitAt, getVectorForRotation 
} from './gameLogic';

// Weights for Evaluation
const SCORES = {
  KILL_UNIT_MULTIPLIER: 100, // Base score * value of unit killed
  UNIT_VALUES: {
    [UnitType.CAVALRY]: 5,
    [UnitType.ARCHER]: 4,
    [UnitType.INFANTRY]: 2
  },
  SURVIVAL: 50, // Per unit alive
  SUPPORT_BONUS: 10, // Standing on support line
  FLANKING_POS: 5, // Standing in potential flank pos
  DANGER_PENALTY: -20, // Standing in range of enemy
};

// Generate Computer Support Lines (Middle Tactics)
export const getComputerSupportPlacement = (): SupportLine[] => {
  // Strategy: Occupy the center (indices 3, 4, 5) to control the board
  // Randomize slightly between row/col mix
  const options = [
    [{type: 'col', index: 3}, {type: 'col', index: 4}, {type: 'col', index: 5}],
    [{type: 'row', index: 3}, {type: 'row', index: 4}, {type: 'row', index: 5}],
    [{type: 'col', index: 4}, {type: 'row', index: 3}, {type: 'row', index: 5}],
    [{type: 'row', index: 4}, {type: 'col', index: 3}, {type: 'col', index: 5}],
  ];
  return options[Math.floor(Math.random() * options.length)] as SupportLine[];
};

// --- Evaluation Function ---
const evaluateState = (gameState: GameState): number => {
  let score = 0;
  
  const myUnits = gameState.units.filter(u => u.player === 'computer');
  const enemyUnits = gameState.units.filter(u => u.player === 'player');

  // Material Score
  myUnits.forEach(u => score += SCORES.SURVIVAL + (SCORES.UNIT_VALUES[u.type] * 10));
  enemyUnits.forEach(u => score -= (SCORES.SURVIVAL + (SCORES.UNIT_VALUES[u.type] * 10)));

  // Positional Score
  myUnits.forEach(u => {
     const strength = calculateBaseStrength(u, gameState.computerSupport);
     score += (strength - 1) * SCORES.SUPPORT_BONUS;

     // Penalty for being vulnerable (especially archers in melee range)
     if (u.type === UnitType.ARCHER) {
        const nearEnemy = enemyUnits.some(e => Math.abs(e.x - u.x) + Math.abs(e.y - u.y) === 1);
        if (nearEnemy) score += SCORES.DANGER_PENALTY * 2;
     }
  });

  return score;
};

export const getComputerMovesLocal = (gameState: GameState): AIAction[] => {
  const difficulty = gameState.difficulty;
  const actions: AIAction[] = [];
  
  // Clone units to simulate state changes during the turn planning
  let simulatedUnits = JSON.parse(JSON.stringify(gameState.units)) as Unit[];
  
  // 1. ATTACK PHASE (Greedy Multi-Unit)
  // Identify if we can kill any enemy with available units
  const enemies = simulatedUnits.filter(u => u.player === 'player');
  const myUnits = simulatedUnits.filter(u => u.player === 'computer');

  // Sort enemies by value (try to kill Cavalry first)
  enemies.sort((a, b) => SCORES.UNIT_VALUES[b.type] - SCORES.UNIT_VALUES[a.type]);

  const unitsThatActed = new Set<string>();

  for (const enemy of enemies) {
      // Find all my units that can attack this enemy (ignoring those that already acted)
      const potentialAttackers = myUnits.filter(u => 
          !unitsThatActed.has(u.id) && canAttack(u, enemy, simulatedUnits)
      );

      if (potentialAttackers.length === 0) continue;

      // Check if we can win
      // We simulate combat in the current gameState context
      const outcome = getCombatOutcome(potentialAttackers, enemy, { ...gameState, units: simulatedUnits });

      if (outcome.winner === 'attacker') {
          // Commit to attack
          potentialAttackers.forEach(atk => {
              actions.push({ unitId: atk.id, actionType: 'attack', target: { x: enemy.x, y: enemy.y } });
              unitsThatActed.add(atk.id);
          });
          // Remove dead enemy from simulation for subsequent calcs
          simulatedUnits = simulatedUnits.filter(u => u.id !== enemy.id);
      }
  }

  // 2. MOVEMENT PHASE
  // For units that didn't attack, find best move.
  const remainingUnits = myUnits.filter(u => !unitsThatActed.has(u.id));

  for (const unit of remainingUnits) {
     const validMoves: AIAction[] = [];

     // Generate Moves
     // - Stay
     validMoves.push({ unitId: unit.id, actionType: 'move', target: { x: unit.x, y: unit.y } });
     
     // - Move to valid tiles (1-Based)
     for (let y = 1; y <= GRID_SIZE; y++) {
       for (let x = 1; x <= GRID_SIZE; x++) {
          if (isValidMove(unit, x, y, simulatedUnits)) {
             validMoves.push({ unitId: unit.id, actionType: 'move', target: { x, y } });
          }
       }
     }

     // FILTER MOVES BASED ON DIFFICULTY
     let sampleSize = 1;
     if (difficulty === 'random') sampleSize = 1;
     else if (difficulty === 'easy') sampleSize = Math.max(1, Math.floor(validMoves.length * 0.1));
     else if (difficulty === 'medium') sampleSize = Math.max(2, Math.floor(validMoves.length * 0.5));
     else if (difficulty === 'hard') sampleSize = validMoves.length; // Check all

     // Randomize and slice
     const candidates = validMoves.sort(() => Math.random() - 0.5).slice(0, sampleSize);

     let bestAction: AIAction | null = null;
     let bestScore = -Infinity;

     for (const action of candidates) {
        if (!action.target) continue;

        // Simulate One Step
        const nextUnits = simulatedUnits.map(u => {
             if (u.id === unit.id) {
                 // Auto rotate logic for sim
                 let newRot = u.rotation;
                 if (action.target!.y < u.y) newRot = Direction.NORTH;
                 else if (action.target!.x > u.x) newRot = Direction.EAST;
                 else if (action.target!.y > u.y) newRot = Direction.SOUTH;
                 else if (action.target!.x < u.x) newRot = Direction.WEST;
                 
                 return { ...u, x: action.target!.x, y: action.target!.y, rotation: newRot };
             }
             return u;
        });

        // Evaluate
        const score = evaluateState({ ...gameState, units: nextUnits });
        if (score > bestScore) {
            bestScore = score;
            bestAction = action;
        }
     }

     if (bestAction) {
         if (bestAction.target && (bestAction.target.x !== unit.x || bestAction.target.y !== unit.y)) {
            actions.push(bestAction);
            // Update sim for next unit in loop (so they don't collide)
             simulatedUnits = simulatedUnits.map(u => {
                 if (u.id === unit.id) {
                     return { ...u, x: bestAction!.target!.x, y: bestAction!.target!.y };
                 }
                 return u;
            });
         }
     }
  }

  actions.push({ unitId: 'global', actionType: 'end_turn' });
  return actions;
};