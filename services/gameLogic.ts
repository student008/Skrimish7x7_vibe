import { Unit, UnitType, Direction, Coordinate, SupportLine, Player, GameState } from '../types';

export const GRID_SIZE = 7;

export const INITIAL_ARMY_COMPOSITION = [
  UnitType.INFANTRY, UnitType.INFANTRY,
  UnitType.ARCHER, UnitType.ARCHER,
  UnitType.CAVALRY, UnitType.CAVALRY
];

// Helper: Get dx/dy for a direction
export const getVectorForRotation = (dir: Direction): { x: number, y: number } => {
  switch (dir) {
    case Direction.NORTH: return { x: 0, y: -1 };
    case Direction.SOUTH: return { x: 0, y: 1 };
    case Direction.EAST:  return { x: 1, y: 0 };
    case Direction.WEST:  return { x: -1, y: 0 };
  }
};

// Helper: Check if Attacker is flanking Defender
export const getFlankBonus = (attacker: Unit, defender: Unit): number => {
  if (attacker.type === UnitType.ARCHER) return 0; // Archers don't get flank bonus per rules

  const dx = attacker.x - defender.x;
  const dy = attacker.y - defender.y;

  // Defender facing vector
  const { x: fx, y: fy } = getVectorForRotation(defender.rotation);

  // If attacker is exactly opposite to facing vector, it's a Front Attack.
  // Front: (dx, dy) == (fx, fy)
  if (dx === fx && dy === fy) return 0;

  // Otherwise (Side or Rear), it's +1
  return 1;
};

// Calculate strength of a unit (Static stats + Support)
export const calculateBaseStrength = (
  unit: Unit,
  supportLines: SupportLine[]
): number => {
  let strength = 1; // Base

  // Support Bonuses
  const mySupports = supportLines.filter(sl => sl.player === unit.player);
  
  mySupports.forEach(sl => {
    if (sl.type === 'row' && sl.index === unit.y) strength += 1;
    if (sl.type === 'col' && sl.index === unit.x) strength += 1;
  });

  return strength;
};

export const getUnitAt = (units: Unit[], x: number, y: number): Unit | undefined => {
  return units.find(u => u.x === x && u.y === y);
};

export const isValidMove = (unit: Unit, targetX: number, targetY: number, allUnits: Unit[]): boolean => {
  // 1-Based Indexing Check
  if (targetX < 1 || targetX > GRID_SIZE || targetY < 1 || targetY > GRID_SIZE) return false;
  
  const targetOccupied = getUnitAt(allUnits, targetX, targetY);
  if (targetOccupied) return false;

  const dx = targetX - unit.x;
  const dy = targetY - unit.y;
  const absDist = Math.abs(dx) + Math.abs(dy);

  // Standard 1-tile move
  if (absDist === 1) return true;

  // Cavalry Charge: Move 2 tiles straight if facing that way
  if (unit.type === UnitType.CAVALRY && unit.movesLeft >= 2 && absDist === 2) {
    const vec = getVectorForRotation(unit.rotation);
    // Check if moving exactly 2 tiles in facing direction
    if (dx === vec.x * 2 && dy === vec.y * 2) {
      // Check if intermediate tile is empty
      const midX = unit.x + vec.x;
      const midY = unit.y + vec.y;
      if (!getUnitAt(allUnits, midX, midY)) {
        return true;
      }
    }
  }

  return false;
};

export const canRotate = (unit: Unit): boolean => {
  // Polish rules: "Can rotate as long as at least one move remains"
  return unit.movesLeft > 0;
};

export const canAttack = (attacker: Unit, defender: Unit, allUnits: Unit[]): boolean => {
  if (attacker.attacksLeft <= 0) return false;
  if (attacker.player === defender.player) return false;

  const dxRaw = defender.x - attacker.x;
  const dyRaw = defender.y - attacker.y;

  // FACING CHECK: Attacker must be facing the target
  const facing = getVectorForRotation(attacker.rotation);
  const dotProduct = dxRaw * facing.x + dyRaw * facing.y;
  
  // If dot product <= 0, the target is "behind" or exactly "side" relative to facing 90deg cone
  if (dotProduct <= 0) return false;

  const dx = Math.abs(dxRaw);
  const dy = Math.abs(dyRaw);
  const dist = dx + dy;

  if (attacker.type === UnitType.ARCHER) {
      // Range logic
      const isDiagonal = dx === 1 && dy === 1;
      const isLinearGap = (dx === 2 && dy === 0) || (dx === 0 && dy === 2);
      const isAdjacentToAnyEnemy = allUnits.some(e => 
        e.player !== attacker.player && (Math.abs(attacker.x - e.x) + Math.abs(attacker.y - e.y)) === 1
      );
      
      if (isAdjacentToAnyEnemy) return false; // Cannot shoot if engaged

      if (isDiagonal || isLinearGap) {
         if (isLinearGap) {
            const midX = (attacker.x + defender.x) / 2;
            const midY = (attacker.y + defender.y) / 2;
            if (getUnitAt(allUnits, midX, midY)) return false; // Blocked
         }
         return true;
      }
      return false;
  } else {
    // Melee
    return dist === 1;
  }
};

export const getValidAttackTargets = (unit: Unit, allUnits: Unit[]): Unit[] => {
  const enemies = allUnits.filter(u => u.player !== unit.player);
  return enemies.filter(enemy => canAttack(unit, enemy, allUnits));
};

export const isValidSupportPlacement = (supports: SupportLine[], newSupport: SupportLine): boolean => {
  if (supports.length >= 3) return false;
  for (const s of supports) {
    if (s.type === newSupport.type) {
      // Allow adjacent lines, just not duplicates of the exact same line
      if (s.index === newSupport.index) return false;
    }
  }
  return true;
};

export const resolveCombat = (
  attackers: Unit[], 
  defender: Unit, 
  attackerSupport: SupportLine[], 
  defenderSupport: SupportLine[]
): { winner: 'attacker' | 'defender' | 'tie', log: string, atkTotal: number, defTotal: number } => {
  
  // --- DEFENDER CALC ---
  let defBase = calculateBaseStrength(defender, defenderSupport);
  let defDetails = `[Base+Sup: ${defBase}]`;
  let defTotal = defBase;

  // --- ATTACKERS CALC ---
  let atkTotal = 0;
  let atkLogParts: string[] = [];

  attackers.forEach(atk => {
    let strength = calculateBaseStrength(atk, attackerSupport);
    let details = `${atk.type}(${strength}`;
    
    // Flanking
    const flank = getFlankBonus(atk, defender);
    if (flank > 0) {
      strength += flank;
      details += `+Flank`;
    }

    // Charge (Cavalry only)
    if (atk.type === UnitType.CAVALRY && atk.movesLeft > 0) {
      strength += 1;
      details += `+Charge`;
    }

    details += `)`;
    atkLogParts.push(details);
    atkTotal += strength;
  });

  let log = `COMBAT: ${atkLogParts.join(' + ')} = ${atkTotal} vs Defender ${defDetails} = ${defTotal}. `;

  // Special Rule: Archers die instantly in melee defense
  // If defender is Archer and ANY attacker is NOT Archer, it's a melee kill.
  if (defender.type === UnitType.ARCHER && attackers.some(a => a.type !== UnitType.ARCHER)) {
      log = `Melee units overrun Archer! Auto-win.`;
      return { winner: 'attacker', log, atkTotal, defTotal: 0 };
  }

  if (atkTotal > defTotal) {
    log += `Attackers win!`;
    return { winner: 'attacker', log, atkTotal, defTotal };
  } else if (defTotal > atkTotal) {
    // Melee attackers die if they lose. Ranged attackers just fail.
    const isMeleeAttack = attackers.some(u => u.type !== UnitType.ARCHER);

    if (isMeleeAttack) {
        log += `Defender Repels Attack! Attackers Lost.`;
        return { winner: 'defender', log, atkTotal, defTotal }; 
    } else {
        log += `Ranged Attack Failed.`;
        return { winner: 'tie', log, atkTotal, defTotal }; // Treat as tie (nobody dies)
    }
  } else {
    log += `Stalemate.`;
    return { winner: 'tie', log, atkTotal, defTotal };
  }
};

export const getCombatOutcome = (
    attackers: Unit[], 
    defender: Unit, 
    gameState: GameState
) => {
    return resolveCombat(attackers, defender, gameState.computerSupport, gameState.playerSupport);
};