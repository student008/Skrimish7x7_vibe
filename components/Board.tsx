import React from 'react';
import { Unit, UnitType, Coordinate, SupportLine, Player, PendingAttack } from '../types';
import { GRID_SIZE } from '../services/gameLogic';

interface BoardProps {
  units: Unit[];
  playerSupport: SupportLine[];
  computerSupport: SupportLine[];
  showComputerSupport: boolean;
  onTileClick: (x: number, y: number) => void;
  onSupportToggle?: (type: 'row' | 'col', index: number) => void;
  selectedUnitId: string | null;
  validMoves: Coordinate[];
  validTargets: Coordinate[];
  phase: string;
  combatState: { attackerIds: string[], defenderId: string } | null;
  pendingAttack: PendingAttack | null;
}

const UnitIcon: React.FC<{ type: UnitType; player: Player }> = ({ type, player }) => {
  const colorClass = player === 'player' ? 'text-blue-500 fill-current' : 'text-red-500 fill-current';
  
  switch (type) {
    case UnitType.INFANTRY:
      // Icon: Helmet and Spear
      return (
        <svg viewBox="0 0 100 100" className={`w-4/5 h-4/5 ${colorClass} drop-shadow-md`}>
           {/* Spear diagonal background */}
           <line x1="20" y1="85" x2="85" y2="20" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
           <path d="M85,20 L75,25 L88,8 L92,25 L85,20" fill="currentColor" />
           
           {/* Helmet foreground */}
           <path d="M25,55 C25,25 75,25 75,55 L75,75 L65,65 L65,55 L35,55 L35,65 L25,75 Z" fill="currentColor" stroke="none" />
           {/* Helmet Details */}
           <path d="M48,55 L52,55 L52,70 L50,75 L48,70 Z" fill="currentColor" opacity="0.7" />
           <path d="M35,30 Q50,10 65,30" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.7" />
        </svg>
      );
    case UnitType.ARCHER:
       // Icon: Bow and Arrow
      return (
        <svg viewBox="0 0 100 100" className={`w-4/5 h-4/5 ${colorClass} drop-shadow-md`}>
           {/* Bow */}
           <path d="M30,15 C0,35 0,65 30,85" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
           <line x1="30" y1="15" x2="30" y2="85" stroke="currentColor" strokeWidth="1" opacity="0.8"/>
           
           {/* Arrow loaded */}
           <line x1="10" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="4" />
           <path d="M70,40 L85,50 L70,60" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case UnitType.CAVALRY:
       // Icon: Horse Head
      return (
        <svg viewBox="0 0 100 100" className={`w-4/5 h-4/5 ${colorClass} drop-shadow-md`}>
            {/* Base */}
            <path d="M20,85 L80,85 L85,95 L15,95 Z" fill="currentColor" />
            {/* Head */}
            <path d="M30,85 L35,45 C35,45 25,40 25,25 C25,10 45,5 60,5 C70,5 75,10 80,15 C80,15 80,25 75,30 L70,35 L60,35 L55,40 L60,60 L70,70 L70,85 L30,85 Z" fill="currentColor" />
            {/* Eye */}
            <circle cx="60" cy="22" r="2" fill="rgba(0,0,0,0.3)" /> 
        </svg>
      );
    default:
      return null;
  }
};

const Board: React.FC<BoardProps> = ({ 
  units, 
  playerSupport, 
  computerSupport,
  showComputerSupport,
  onTileClick, 
  onSupportToggle,
  selectedUnitId, 
  validMoves,
  validTargets,
  phase,
  combatState,
  pendingAttack
}) => {
  // 1-Based Indices
  const indices = Array.from({ length: GRID_SIZE }, (_, i) => i + 1);

  // Common styles for support lines to match visual weight
  const lineStyleBase = "absolute pointer-events-none z-0";
  // Reduced red glow to match blue
  const blueLine = `${lineStyleBase} bg-blue-500/30 shadow-[0_0_8px_rgba(59,130,246,0.6)]`;
  const redLine = `${lineStyleBase} bg-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.6)]`;

  return (
    <div className="relative inline-block bg-slate-900 p-2 rounded-xl border-4 border-slate-700 shadow-2xl select-none">
      
      {/* Grid Layout */}
      <div className="grid gap-1" style={{ gridTemplateColumns: `3rem repeat(${GRID_SIZE}, minmax(0, 1fr))` }}>
        
        {/* Top-Left Empty */}
        <div className="w-12 h-12"></div>

        {/* Top Headers (Columns) */}
        {indices.map(x => {
           const pSup = playerSupport.find(s => s.type === 'col' && s.index === x);
           const cSup = showComputerSupport ? computerSupport.find(s => s.type === 'col' && s.index === x) : null;
           
           return (
             <div 
               key={`head-col-${x}`}
               onClick={() => onSupportToggle && onSupportToggle('col', x)}
               className={`
                 h-12 flex flex-col items-center justify-center font-bold text-sm transition-all relative
                 ${phase === 'setup_support' ? 'cursor-pointer hover:bg-slate-700' : ''}
                 text-slate-500
               `}
             >
               {x}
               {/* Visual Lines */}
               {pSup && <div className={`${blueLine} top-14 bottom-[-32rem] w-1`}></div>}
               {cSup && <div className={`${redLine} top-14 bottom-[-32rem] w-1`}></div>}
               
               {/* Indicators in Header */}
               {pSup && <div className="w-full h-1 bg-blue-500 absolute bottom-0 shadow-lg shadow-blue-500/50"></div>}
               {cSup && <div className="w-full h-1 bg-red-500 absolute top-0 shadow-lg shadow-red-500/50"></div>}
             </div>
           );
        })}

        {/* Rows */}
        {indices.map(y => (
          <React.Fragment key={`row-${y}`}>
            {/* Left Header (Rows) */}
            <div 
               onClick={() => onSupportToggle && onSupportToggle('row', y)}
               className={`
                 w-12 h-10 sm:h-14 md:h-16 flex flex-row items-center justify-center font-bold text-sm transition-all relative
                 ${phase === 'setup_support' ? 'cursor-pointer hover:bg-slate-700' : ''}
                 text-slate-500
               `}
            >
              {y}
               {/* Visual Lines */}
               {playerSupport.some(s => s.type === 'row' && s.index === y) && (
                 <div className={`${blueLine} left-14 right-[-32rem] h-1`}></div>
               )}
               {showComputerSupport && computerSupport.some(s => s.type === 'row' && s.index === y) && (
                 <div className={`${redLine} left-14 right-[-32rem] h-1`}></div>
               )}

               {/* Indicators */}
               {playerSupport.some(s => s.type === 'row' && s.index === y) && <div className="h-full w-1 bg-blue-500 absolute right-0 shadow-lg shadow-blue-500/50"></div>}
               {showComputerSupport && computerSupport.some(s => s.type === 'row' && s.index === y) && <div className="h-full w-1 bg-red-500 absolute left-0 shadow-lg shadow-red-500/50"></div>}
            </div>

            {/* Cells */}
            {indices.map(x => {
              const isValidMoveTile = validMoves.some(m => m.x === x && m.y === y);
              const isValidTargetTile = validTargets.some(t => t.x === x && t.y === y);
              
              let isDeploymentZone = false;
              if (phase === 'setup_placement') {
                 // 1-Based: Rows 6,7. Cols 3,4,5.
                 if (y >= 6 && x >= 3 && x <= 5) isDeploymentZone = true;
              }

              // Highlight Pending Attack Target
              const isPendingTarget = pendingAttack?.targetId && 
                units.find(u => u.id === pendingAttack.targetId)?.x === x &&
                units.find(u => u.id === pendingAttack.targetId)?.y === y;

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => onTileClick(x, y)}
                  className={`
                    relative w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 
                    rounded border transition-colors duration-200
                    ${isValidMoveTile ? 'bg-green-900/40 border-green-500/70 hover:bg-green-800/60 cursor-pointer' : ''}
                    ${isValidTargetTile ? 'bg-red-900/30 border-red-500/50 hover:bg-red-800/60 cursor-pointer' : ''}
                    ${isDeploymentZone ? 'bg-blue-900/20 border-blue-500/60 animate-pulse' : 'border-slate-800 bg-slate-800/50'}
                    ${isPendingTarget ? 'ring-4 ring-red-600 bg-red-900/60' : ''}
                    ${!isValidMoveTile && !isValidTargetTile && !isDeploymentZone ? 'hover:bg-slate-700/30' : ''}
                  `}
                >
                  <span className="absolute bottom-0 right-0.5 text-[8px] text-slate-600 opacity-50">{x},{y}</span>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Units Layer */}
      <div className="absolute inset-0 pointer-events-none" style={{ 
          left: '3rem', top: '3rem', width: `calc(100% - 3rem)`, height: `calc(100% - 3rem)` 
      }}>
         {units.map(unit => {
           const isSelected = unit.id === selectedUnitId;
           // Check if this unit is part of a pending attack
           const isPendingAttacker = pendingAttack?.attackerIds.includes(unit.id);
           const isPendingTarget = pendingAttack?.targetId === unit.id;

           // Adjust positioning for 1-based indexing
           // (val - 1) * 100/GRID_SIZE
           const left = (unit.x - 1) * (100 / GRID_SIZE);
           const top = (unit.y - 1) * (100 / GRID_SIZE);

           const isAttacking = combatState?.attackerIds.includes(unit.id);
           const isDefending = combatState?.defenderId === unit.id;
           
           const isExhausted = unit.movesLeft === 0 && unit.attacksLeft === 0 && unit.player === 'player';

           return (
             <div
               key={unit.id}
               className={`
                 absolute w-[14.28%] h-[14.28%] flex items-center justify-center
                 transition-all duration-500 ease-in-out z-20
                 ${isSelected || isPendingAttacker ? 'z-30' : ''}
               `}
               style={{ 
                   left: `${left}%`, 
                   top: `${top}%`
               }}
             >
                <div className={`
                   relative w-3/4 h-3/4 flex items-center justify-center
                   transition-transform duration-300
                   ${isAttacking ? 'scale-125 z-40' : ''}
                   ${isDefending ? 'animate-bounce text-red-600' : ''}
                   ${isExhausted ? 'grayscale opacity-60' : ''}
                `}
                style={{ 
                  transform: `rotate(${unit.rotation * 90}deg) ${isAttacking ? 'scale(1.2)' : 'scale(1)'}` 
                }}
                >
                    {/* Selected Highlight */}
                    {isSelected && (
                      <div className="absolute inset-[-4px] rounded-full border-2 border-yellow-400 animate-spin-slow"></div>
                    )}
                    
                    {/* Pending Attack Highlight */}
                    {isPendingAttacker && (
                      <div className="absolute inset-[-6px] rounded-full border-2 border-orange-500 border-dashed animate-pulse">
                         <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-orange-600 text-[8px] px-1 rounded text-white font-bold">ATTACKING</div>
                      </div>
                    )}

                    {/* Pending Target Crosshair */}
                    {isPendingTarget && (
                       <div className="absolute inset-[-10px] border-4 border-red-600 rounded-full opacity-70">
                          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-600"></div>
                          <div className="absolute left-1/2 top-0 h-full w-0.5 bg-red-600"></div>
                       </div>
                    )}
                    
                    {/* Attack Animation Flash */}
                    {isAttacking && (
                      <div className="absolute inset-0 rounded-full bg-orange-500/70 animate-ping"></div>
                    )}

                    {/* Facing Arrow */}
                    <div className={`absolute -top-3 left-1/2 transform -translate-x-1/2 w-0 h-0 
                       border-l-4 border-r-4 border-b-[8px] border-l-transparent border-r-transparent 
                       ${unit.player === 'player' ? 'border-b-blue-400 drop-shadow-[0_0_2px_rgba(59,130,246,1)]' : 'border-b-red-400 drop-shadow-[0_0_2px_rgba(239,68,68,1)]'}
                       z-50
                    `}></div>
                    
                    <UnitIcon type={unit.type} player={unit.player} />

                    {/* Moves Indicator */}
                    {unit.movesLeft < unit.maxMoves && unit.player === 'player' && !isExhausted && (
                       <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                    )}
                </div>
             </div>
           );
         })}
      </div>
    </div>
  );
};

export default Board;