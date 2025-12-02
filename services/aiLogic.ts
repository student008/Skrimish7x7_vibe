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
  
  const selected = options[Math.floor(Math.random() * options.length)];
  
  return selected.map(s => ({
      player: 'computer',
      type: s.type as 'row' | 'col',
      index: s.index
  }));
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

// --- SIMULATION HELPERS ---
const simulateMove = (unit: Unit, targetX: number, targetY: number): Unit => {
    // Determine new rotation based on move
    let newRot = unit.rotation;
    if (targetY < unit.y) newRot = Direction.NORTH;
    else if (targetX > unit.x) newRot = Direction.EAST;
    else if (targetY > unit.y) newRot = Direction.SOUTH;
    else if (targetX < unit.x) newRot = Direction.WEST;

    const dist = Math.abs(unit.x - targetX) + Math.abs(unit.y - targetY);
    
    return { 
        ...unit, 
        x: targetX, 
        y: targetY, 
        rotation: newRot, 
        movesLeft: Math.max(0, unit.movesLeft - dist) 
    };
};

export const getComputerMovesLocal = (gameState: GameState): AIAction[] => {
  const difficulty = gameState.difficulty;
  const actions: AIAction[] = [];
  
  // Clone units to simulate state changes during the turn planning
  let simulatedUnits = JSON.parse(JSON.stringify(gameState.units)) as Unit[];
  
  // Strategy: 
  // Iterate through all my units.
  // For each unit, generate a list of possible Action Sequences:
  // 1. [Attack] (if possible)
  // 2. [Move] -> [Attack] (if possible)
  // 3. [Move] (positioning)
  // Evaluate the state resulting from each sequence.
  // Pick the best one.
  
  // Priorities: Units that can attack/kill should go first to clear board?
  // Or just iterate standard list.
  
  const myUnits = simulatedUnits.filter(u => u.player === 'computer');
  // Sort by ID to keep order deterministic
  myUnits.sort((a, b) => a.id.localeCompare(b.id));

  for (const unit of myUnits) {
     // If unit was removed in previous simulation steps (e.g. self-destruct? unlikely), skip
     if (!simulatedUnits.find(u => u.id === unit.id)) continue;

     // Update reference to current state of this unit
     const currentUnit = simulatedUnits.find(u => u.id === unit.id)!;
     
     const possibleSequences: AIAction[][] = [];
     
     // OPTION A: Stay & Attack (if possible)
     const directTargets = simulatedUnits.filter(e => e.player === 'player' && canAttack(currentUnit, e, simulatedUnits));
     directTargets.forEach(target => {
         possibleSequences.push([
             { unitId: currentUnit.id, actionType: 'attack', target: { x: target.x, y: target.y } }
         ]);
     });

     // OPTION B: Move (and optionally Attack)
     const validMoves: {x: number, y: number}[] = [];
     
     // Generate valid moves (1..7)
     for (let y = 1; y <= GRID_SIZE; y++) {
        for (let x = 1; x <= GRID_SIZE; x++) {
           if (isValidMove(currentUnit, x, y, simulatedUnits)) {
               validMoves.push({x, y});
           }
        }
     }

     // Limit move search based on difficulty
     let moveSample = validMoves;
     if (difficulty === 'easy') moveSample = validMoves.filter(() => Math.random() < 0.2);
     if (difficulty === 'medium') moveSample = validMoves.filter(() => Math.random() < 0.6);

     for (const move of moveSample) {
         // Sim Move
         const movedUnit = simulateMove(currentUnit, move.x, move.y);
         
         // Create a temp unit list for checking attack validity from new pos
         const unitsAfterMove = simulatedUnits.map(u => u.id === movedUnit.id ? movedUnit : u);
         
         // Check if can attack from new pos
         const postMoveTargets = simulatedUnits.filter(e => e.player === 'player' && canAttack(movedUnit, e, unitsAfterMove));
         
         if (postMoveTargets.length > 0) {
             // Sequence: Move -> Attack
             postMoveTargets.forEach(target => {
                 possibleSequences.push([
                     { unitId: currentUnit.id, actionType: 'move', target: { x: move.x, y: move.y } },
                     { unitId: currentUnit.id, actionType: 'attack', target: { x: target.x, y: target.y } }
                 ]);
             });
         }
         
         // Sequence: Move only
         possibleSequences.push([
             { unitId: currentUnit.id, actionType: 'move', target: { x: move.x, y: move.y } }
         ]);
     }

     // OPTION C: Stay (No-op)
     possibleSequences.push([]); 

     // --- EVALUATE SEQUENCES ---
     let bestSeq: AIAction[] = [];
     let bestScore = -Infinity;

     for (const seq of possibleSequences) {
         let tempUnits = JSON.parse(JSON.stringify(simulatedUnits)) as Unit[];
         let tempGameState = { ...gameState, units: tempUnits };
         let sequenceScore = 0;
         
         // Apply sequence
         for (const act of seq) {
             if (act.actionType === 'move' && act.target) {
                 tempUnits = tempUnits.map(u => u.id === act.unitId ? simulateMove(u, act.target!.x, act.target!.y) : u);
             } else if (act.actionType === 'attack' && act.target) {
                 const atk = tempUnits.find(u => u.id === act.unitId);
                 const def = getUnitAt(tempUnits, act.target!.x, act.target!.y);
                 if (atk && def) {
                     const res = getCombatOutcome([atk], def, tempGameState);
                     if (res.winner === 'attacker') {
                         tempUnits = tempUnits.filter(u => u.id !== def.id);
                         sequenceScore += SCORES.KILL_UNIT_MULTIPLIER * SCORES.UNIT_VALUES[def.type];
                     } else if (res.winner === 'defender') {
                         tempUnits = tempUnits.filter(u => u.id !== atk.id);
                     }
                 }
             }
         }
         
         // Score resulting state
         const stateScore = evaluateState({ ...tempGameState, units: tempUnits });
         const totalScore = sequenceScore + stateScore;
         
         if (totalScore > bestScore) {
             bestScore = totalScore;
             bestSeq = seq;
         }
     }

     // Commit best sequence for this unit
     if (bestSeq.length > 0) {
         bestSeq.forEach(act => actions.push(act));
         
         // Update global simulation for next units
         for (const act of bestSeq) {
             if (act.actionType === 'move' && act.target) {
                 simulatedUnits = simulatedUnits.map(u => u.id === act.unitId ? simulateMove(u, act.target!.x, act.target!.y) : u);
             } else if (act.actionType === 'attack' && act.target) {
                 const atk = simulatedUnits.find(u => u.id === act.unitId);
                 const def = getUnitAt(simulatedUnits, act.target!.x, act.target!.y);
                 if (atk && def) {
                     const res = getCombatOutcome([atk], def, { ...gameState, units: simulatedUnits });
                     if (res.winner === 'attacker') {
                         simulatedUnits = simulatedUnits.filter(u => u.id !== def.id);
                     } else if (res.winner === 'defender') {
                         simulatedUnits = simulatedUnits.filter(u => u.id !== atk.id);
                     }
                 }
             }
         }
     }
  }

  actions.push({ unitId: 'global', actionType: 'end_turn' });
  return actions;
};