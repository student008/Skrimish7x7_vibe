export type Player = 'player' | 'computer';

export type Difficulty = 'random' | 'easy' | 'medium' | 'hard';

export enum UnitType {
  INFANTRY = 'Infantry',
  ARCHER = 'Archer',
  CAVALRY = 'Cavalry',
}

export enum Direction {
  NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3,
}

export interface Unit {
  id: string;
  type: UnitType;
  player: Player;
  x: number;
  y: number;
  rotation: Direction;
  // State for the current turn
  movesLeft: number;
  attacksLeft: number;
  hasRotated: boolean; // Tracking if rotation happened for rule checks
  maxMoves: number;
  hp: number; // Basically 1 for this game, but good for structure
}

export interface SupportLine {
  player: Player;
  type: 'row' | 'col';
  index: number;
}

export interface PendingAttack {
  targetId: string; // The enemy being attacked
  attackerIds: string[]; // List of own units joining the attack
}

export interface GameState {
  gridSize: number;
  difficulty: Difficulty;
  units: Unit[];
  playerSupport: SupportLine[];
  computerSupport: SupportLine[];
  turn: Player | 'setup_placement' | 'setup_support' | 'game_over';
  winner: Player | null;
  selectedUnitId: string | null;
  logs: string[];
  combatState: { attackerIds: string[], defenderId: string } | null; // For animation
  pendingAttack: PendingAttack | null; // For planning phase
  showComputerSupport: boolean;
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface AIAction {
  unitId: string;
  actionType: 'move' | 'rotate' | 'attack' | 'end_turn';
  target?: Coordinate; // For move/attack
  direction?: Direction; // For rotate
}