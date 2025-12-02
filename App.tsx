import React, { useState, useEffect, useRef } from 'react';
import Board from './components/Board';
import { 
  GameState, Unit, UnitType, Player, Direction, SupportLine, PendingAttack, AIAction, Difficulty 
} from './types';
import { 
  GRID_SIZE, INITIAL_ARMY_COMPOSITION, getUnitAt, isValidMove, canRotate, getValidAttackTargets, 
  calculateBaseStrength, isValidSupportPlacement, resolveCombat, canAttack
} from './services/gameLogic';
import { getComputerMovesLocal, getComputerSupportPlacement } from './services/aiLogic';

const generateId = () => Math.random().toString(36).substr(2, 9);

const RULES_TEXT = `1. Gra toczy się na planszy z kwadratowymi polami, 7x7 pól.
2. Każdy z graczy ma do dyspozycji maksymalnie sześć żetonów.
3. Żetony reprezentują jednostki: piechotę, łuczników lub konnicę.
4. Gracze rozmieszczają swoje jednostki na obszarze 2x3 pola przy krawędzi swojej planszy.
5. Z boku planszy umieszcza się (zapisuje w sekrecie ich położenie, ujawniane stopniowo w czasie gry) trzy żetony wsparcia. Żeton odziaływuje na poziomy lub pionowy szereg pól, dodając +1 siły jednostkom na nim się znajdującym. Nie można ustawiać żetonów na sąsiadująych ze sobą rzędach lub kolumnach. Jeśli linie się krzyżują, wówczas jednostka znajdująca się na danym polu dostaje +2 do siły.
6. Gracze na przemian wykonują ruchy swoimi jednostkami - każdy może poruszyć dowolną ilość jednostek w swojej turze.
7. Kolejność czynności przed rozpoczęciem rozgrywki jest następująca: 1) Początkowy skład sił może być dowolny, gracze mogą się umówić co do składu armii. Klasyczna armia to 2 jednostki piechoty, 2 jednostki konnicy, 2 jednostki łuczników. Można się umówić, że na początku się "kupuje" armię (konnica - 2 punkty, pozostałe jednostki - 1 punkt) i skład armii trzyma w sekrecie do momentu wyłożenia żetonów. 2) Gracze układają zakryte żetony w formacji jakiej będą je potem ustawiać na planszy. 3) Zapisują położenie żetonów wsparcia. 4) Układają odkryte żetony jednostek na planszy. 
8. Każda jednostka ma ustalony "przód", jest nim jeden z boków żetonu. Jeśli atak następuje z boku lub od tyłu, wówczas atakujący otrzymuje +1 do siły. Atakować można tylko jednostki sąsiadujące z polem będącym na "przodzie" jednostki.
9. Każda jednostka może ruszyć się, atakować lub obrócić. Dozwolne są także dowolne dwie kombinacje tych akcji. Każda jednostka może też ruch+obrót+atak lub atak+obrót+ruch. Za "ruch" może też liczyć się "tupnięcie w miejscu", innymi słowy, po wyczerpaniu ruchów nie można się obracać. Konnica może wykonać dowolną kombinację akcji (np. obrót+ruch+obrót+atak+obrót+ruch) pod warunkami 1) nie więcej niż dwa ruchy na turę 2) jeden atak na turę 3) obracać się można dopóki został chociaż jeden ruch.
10. Ruch jest to przesunięcie jednostki o jedno pole w pionie lub poziomie, na dowolne nie zajęte przez inną jednostkę pole.
11. Kiedy dwie jednostki należące do różnych graczy znajdują się na polach sąsiadujących, można zadeklarować atak. Łucznicy nie walczą wręcz, kiedy zostają zaatakowani są automatycznie pobici. Atakować można jednostkę znajdującą się z frontu.
12. Rozstrzygnięcie walki odbywa się przez porównanie siły dwóch jednostek. Jeśli któraś z jednostek ma większą siłę, wygrywa. Przy remisie obie pozostają na swoich polach. Obaj gracze muszą zadeklarować wszystkie bonusy do siły wynikające z położenia żetonów wsparcia. Nie trzeba jednak wskazywać ich umiejscowienia (np. czy bonus wynika z linii poziomej czy pionowej). Gracze mogą zaznaczać oczywiste lokalizacje żetonów. 
13. Konnica atakująca z odległości 1 pola może poświęcić pozostały ruch na dodanie +1 do siły. (Szarża)
14. Łucznicy nie inicjują walki wręcz, za to atakują z odległości jednego pola. Na siłę ataku nie ma wpływu, czy następuje on z flanki czy od przodu. Na wynik ataku wpływają żetony wsparcia, zarówno u łuczników jak i jednostki będącej celem. Łucznicy nie mogą strzelać "ponad" jakąś jednostką, nie mogą strzelać, kiedy sąsiadują z jakąś wrogą jednostką. Mogą natomiast atakować jednostkę znajdującą się na polu stykającym się rogiem z polem, na którym stoją łucznicy. 
15. Pobita jednostka jest zdejmowana z planszy.
16. Gra toczy się dopóki jeden z graczy nie straci wszystkich żetonów, podda się lub obaj gracze jeden po drugim nie wykonają żadnego ruchu.`;

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    gridSize: GRID_SIZE,
    difficulty: 'medium',
    units: [],
    playerSupport: [],
    computerSupport: [],
    turn: 'setup_placement',
    winner: null,
    selectedUnitId: null,
    logs: ['Welcome to "Skrimish 7x7"', 'Place your units in the blue zone (Bottom 2 rows).'],
    combatState: null,
    pendingAttack: null,
    showComputerSupport: false
  });

  const [showRules, setShowRules] = useState(false);

  // Ref to track current game state during async operations
  const gameStateRef = useRef(gameState);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  const [setupUnitsLeft, setSetupUnitsLeft] = useState<UnitType[]>([...INITIAL_ARMY_COMPOSITION]);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [aiPlan, setAiPlan] = useState<AIAction[] | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameState.logs]);

  // Initial Computer Setup (Hidden)
  useEffect(() => {
    const compUnits: Unit[] = [];
    const compTypes = [...INITIAL_ARMY_COMPOSITION];
    
    // Deployment zone for Computer (7x7, 1-based): 
    // Top 2 rows (y=1, 2), centered 3 cols (x=3, 4, 5).
    let placements: {x:number, y:number}[] = [];
    for(let y=1; y<=2; y++) {
      for(let x=3; x<=5; x++) {
        placements.push({x,y});
      }
    }
    // Shuffle placements
    placements = placements.sort(() => Math.random() - 0.5);

    compTypes.forEach((type, idx) => {
       if (idx < placements.length) {
         compUnits.push({
           id: generateId(),
           type,
           player: 'computer',
           x: placements[idx].x,
           y: placements[idx].y,
           rotation: Direction.SOUTH,
           movesLeft: type === UnitType.CAVALRY ? 2 : 1,
           attacksLeft: 1,
           hasRotated: false,
           maxMoves: type === UnitType.CAVALRY ? 2 : 1,
           hp: 1
         });
       }
    });

    const compSupport = getComputerSupportPlacement();

    setGameState(prev => ({
      ...prev,
      units: [...prev.units, ...compUnits],
      computerSupport: compSupport
    }));
  }, []);

  const addLog = (msg: string) => {
    setGameState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
  };

  const handleTileClick = (x: number, y: number) => {
    if (gameState.winner || isProcessingAI || aiPlan) return;

    if (gameState.turn === 'setup_placement') {
      handleSetupPlacement(x, y);
    } else if (gameState.turn === 'player') {
      handleGameInteraction(x, y);
    }
  };

  const handleSetupPlacement = (x: number, y: number) => {
    if (setupUnitsLeft.length === 0) return;
    
    // Validate Zone (Player is bottom 7x7: y=6,7, x=3-5)
    // 1-Based: Rows 6, 7. Cols 3, 4, 5.
    if (y < 6 || x < 3 || x > 5) {
      addLog("Invalid placement zone (Bottom center 2x3).");
      return;
    }
    if (getUnitAt(gameState.units, x, y)) {
      addLog("Tile occupied.");
      return;
    }

    const type = setupUnitsLeft[0];
    const newUnit: Unit = {
      id: generateId(),
      type,
      player: 'player',
      x,
      y,
      rotation: Direction.NORTH,
      movesLeft: type === UnitType.CAVALRY ? 2 : 1,
      attacksLeft: 1,
      hasRotated: false,
      maxMoves: type === UnitType.CAVALRY ? 2 : 1,
      hp: 1
    };

    setGameState(prev => ({
      ...prev,
      units: [...prev.units, newUnit]
    }));
    setSetupUnitsLeft(prev => prev.slice(1));
    
    if (setupUnitsLeft.length === 1) {
      addLog("Units placed. Toggle 3 secret support lines using the board headers.");
      setGameState(prev => ({ ...prev, turn: 'setup_support' }));
    }
  };

  const toggleSupport = (type: 'row' | 'col', index: number) => {
    if (gameState.turn !== 'setup_support') return;

    const existingIndex = gameState.playerSupport.findIndex(s => s.type === type && s.index === index);
    
    if (existingIndex >= 0) {
      const newSupport = [...gameState.playerSupport];
      newSupport.splice(existingIndex, 1);
      setGameState(prev => ({ ...prev, playerSupport: newSupport }));
    } else {
      if (gameState.playerSupport.length >= 3) {
        addLog("Max 3 supports allowed. Deselect one first.");
        return;
      }
      const newS: SupportLine = { player: 'player', type, index };
      if (isValidSupportPlacement(gameState.playerSupport, newS)) {
        setGameState(prev => ({ ...prev, playerSupport: [...prev.playerSupport, newS] }));
      } else {
        addLog("Invalid support placement (Adjacent parallel lines not allowed).");
      }
    }
  };

  const finishSetup = () => {
    if (gameState.playerSupport.length !== 3) {
      addLog("You must select exactly 3 support lines.");
      return;
    }
    setGameState(prev => ({ ...prev, turn: 'player' }));
    addLog("Game Start! Your Turn.");
  };

  const handleGameInteraction = (x: number, y: number) => {
    const clickedUnit = getUnitAt(gameState.units, x, y);
    const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);

    // --- Scenario 1: Clicking an ENEMY (Targeting/Attacking) ---
    if (clickedUnit && clickedUnit.player === 'computer') {
        let newAttackerIds: string[] = [];
        
        if (selectedUnit && canAttack(selectedUnit, clickedUnit, gameState.units)) {
            newAttackerIds.push(selectedUnit.id);
        } else if (gameState.pendingAttack?.targetId === clickedUnit.id) {
            return;
        }

        if (gameState.pendingAttack && gameState.pendingAttack.targetId === clickedUnit.id) {
             if (selectedUnit && !gameState.pendingAttack.attackerIds.includes(selectedUnit.id) && canAttack(selectedUnit, clickedUnit, gameState.units)) {
                 setGameState(prev => ({
                     ...prev,
                     pendingAttack: {
                         ...prev.pendingAttack!,
                         attackerIds: [...prev.pendingAttack!.attackerIds, selectedUnit.id]
                     }
                 }));
                 addLog(`${selectedUnit.type} added to attack plan.`);
             }
        } else {
            if (newAttackerIds.length > 0) {
                setGameState(prev => ({
                    ...prev,
                    pendingAttack: { targetId: clickedUnit.id, attackerIds: newAttackerIds }
                }));
                addLog(`Targeting ${clickedUnit.type}. Add more units or Confirm.`);
            } else {
                addLog("Select one of your units first to initiate attack.");
            }
        }
        return;
    }

    // --- Scenario 2: Clicking OWN Unit ---
    if (clickedUnit && clickedUnit.player === 'player') {
        if (gameState.pendingAttack) {
            const target = gameState.units.find(u => u.id === gameState.pendingAttack!.targetId);
            if (target && canAttack(clickedUnit, target, gameState.units)) {
                const alreadyAdded = gameState.pendingAttack.attackerIds.includes(clickedUnit.id);
                if (alreadyAdded) {
                     setGameState(prev => ({
                         ...prev,
                         pendingAttack: {
                             ...prev.pendingAttack!,
                             attackerIds: prev.pendingAttack!.attackerIds.filter(id => id !== clickedUnit.id)
                         }
                     }));
                     addLog(`${clickedUnit.type} removed from attack.`);
                } else {
                    setGameState(prev => ({
                        ...prev,
                        pendingAttack: {
                            ...prev.pendingAttack!,
                            attackerIds: [...prev.pendingAttack!.attackerIds, clickedUnit.id]
                        }
                    }));
                    addLog(`${clickedUnit.type} joining attack.`);
                }
                setGameState(prev => ({ ...prev, selectedUnitId: clickedUnit.id }));
                return;
            }
        }

        setGameState(prev => ({ ...prev, selectedUnitId: clickedUnit.id }));
        return;
    }

    // --- Scenario 3: Empty Tile (Moving) ---
    if (!clickedUnit && selectedUnit) {
        if (gameState.pendingAttack?.attackerIds.includes(selectedUnit.id)) {
            addLog("Unit is preparing to attack. Cancel attack to move.");
            return;
        }

        if (isValidMove(selectedUnit, x, y, gameState.units)) {
             // Calculate cost. Distance 2 means charge = cost 2. Distance 1 = cost 1.
             const dist = Math.abs(selectedUnit.x - x) + Math.abs(selectedUnit.y - y);
             if (selectedUnit.movesLeft >= dist) {
               executeMove(selectedUnit, x, y, dist);
             } else {
               addLog("Not enough moves left.");
             }
        } else {
            setGameState(prev => ({ ...prev, selectedUnitId: null })); // Deselect
        }
    }
  };

  const executeMove = (unit: Unit, x: number, y: number, cost: number = 1) => {
    // Auto-Rotate Logic: Unit turns to face movement direction
    let newRotation = unit.rotation;
    if (y < unit.y) newRotation = Direction.NORTH;
    else if (x > unit.x) newRotation = Direction.EAST;
    else if (y > unit.y) newRotation = Direction.SOUTH;
    else if (x < unit.x) newRotation = Direction.WEST;

    setGameState(prev => {
      const newUnits = prev.units.map(u => {
        if (u.id === unit.id) {
          return { 
            ...u, 
            x, 
            y, 
            rotation: newRotation, 
            movesLeft: u.movesLeft - cost, 
            hasRotated: false 
          };
        }
        return u;
      });
      return { ...prev, units: newUnits };
    });
  };

  const executeRotate = (direction: 'left' | 'right') => {
    const unit = gameState.units.find(u => u.id === gameState.selectedUnitId);
    if (!unit) return;
    
    if (gameState.pendingAttack?.attackerIds.includes(unit.id)) {
        addLog("Cannot rotate while preparing to attack.");
        return;
    }

    if (!canRotate(unit)) {
      addLog("Cannot rotate (Need at least 1 move remaining).");
      return;
    }

    setGameState(prev => {
       const newUnits = prev.units.map(u => {
         if (u.id === unit.id) {
           let newDir = u.rotation;
           if (direction === 'left') newDir = (u.rotation + 3) % 4;
           else newDir = (u.rotation + 1) % 4;
           return { ...u, rotation: newDir, hasRotated: true };
         }
         return u;
       });
       return { ...prev, units: newUnits };
    });
  };

  const confirmPendingAttack = async () => {
      if (!gameState.pendingAttack || gameState.pendingAttack.attackerIds.length === 0) return;

      const { targetId, attackerIds } = gameState.pendingAttack;
      const target = gameState.units.find(u => u.id === targetId);
      const attackers = gameState.units.filter(u => attackerIds.includes(u.id));

      if (!target || attackers.length === 0) {
          setGameState(prev => ({ ...prev, pendingAttack: null }));
          return;
      }

      await executeMultiAttack(attackers, target);
  };

  const executeMultiAttack = async (attackers: Unit[], defender: Unit) => {
    setGameState(prev => ({ ...prev, pendingAttack: null }));

    setGameState(prev => ({ 
        ...prev, 
        combatState: { attackerIds: attackers.map(a => a.id), defenderId: defender.id } 
    }));
    
    await new Promise(r => setTimeout(r, 800));

    setGameState(prev => {
       const curAttackers = prev.units.filter(u => attackers.map(a => a.id).includes(u.id));
       const curDefender = prev.units.find(u => u.id === defender.id);
       
       if (curAttackers.length === 0 || !curDefender) return { ...prev, combatState: null };

       const result = resolveCombat(curAttackers, curDefender, prev.playerSupport, prev.computerSupport);
       
       let newUnits = [...prev.units];
       
       newUnits = newUnits.map(u => {
           if (curAttackers.some(atk => atk.id === u.id)) {
               return { ...u, attacksLeft: 0, movesLeft: Math.max(0, u.movesLeft) };
           }
           return u;
       });

       if (result.winner === 'attacker') {
           newUnits = newUnits.filter(u => u.id !== curDefender.id);
       } else if (result.winner === 'defender') {
           // Attackers Lost! Remove them.
           const attackerIds = curAttackers.map(a => a.id);
           newUnits = newUnits.filter(u => !attackerIds.includes(u.id));
       }

       return { 
           ...prev, 
           units: newUnits, 
           selectedUnitId: null, 
           combatState: null,
           logs: [...prev.logs, result.log]
       };
    });

    setTimeout(checkWinCondition, 100);
  };

  const cancelPendingAttack = () => {
      setGameState(prev => ({ ...prev, pendingAttack: null }));
      addLog("Attack cancelled.");
  };

  const checkWinCondition = () => {
    setGameState(prev => {
      const playerUnits = prev.units.filter(u => u.player === 'player');
      const computerUnits = prev.units.filter(u => u.player === 'computer');
      
      if (playerUnits.length === 0) return { ...prev, winner: 'computer', turn: 'game_over', logs: [...prev.logs, "Defeat! Computer wins."] };
      if (computerUnits.length === 0) return { ...prev, winner: 'player', turn: 'game_over', logs: [...prev.logs, "Victory! You win."] };
      
      return prev;
    });
  };

  const endPlayerTurn = () => {
    setGameState(prev => {
       const resetUnits = prev.units.map(u => 
         u.player === 'player' 
         ? { ...u, movesLeft: u.maxMoves, attacksLeft: 1, hasRotated: false } 
         : u
       );
       return { ...prev, units: resetUnits, turn: 'computer', selectedUnitId: null, pendingAttack: null, combatState: null };
    });
  };

  // 1. Compute AI Moves Local
  useEffect(() => {
    if (gameState.turn === 'computer' && !gameState.winner && !isProcessingAI && !aiPlan) {
        setIsProcessingAI(true);
        addLog(`Computer thinking (${gameState.difficulty})...`);
        
        // Use timeout to allow UI to render "thinking"
        setTimeout(() => {
           const plan = getComputerMovesLocal(gameState);
           setAiPlan(plan);
           setIsProcessingAI(false);
           addLog("Computer ready. Click 'Execute' to watch.");
        }, 500);
    }
  }, [gameState.turn, gameState.winner, isProcessingAI, aiPlan, gameState.difficulty]);

  // 2. Execute AI Plan (Triggered by user button)
  const runComputerTurn = async () => {
    if (!aiPlan) return;
    setIsProcessingAI(true);

    for (const action of aiPlan) {
      if (action.actionType === 'end_turn') break;
      
      await new Promise(r => setTimeout(r, 600)); 

      if (action.actionType === 'move' && action.target) {
        setGameState(current => {
           const unit = current.units.find(u => u.id === action.unitId);
           if (!unit) return current;
           const isOccupied = getUnitAt(current.units, action.target!.x, action.target!.y);
           if (isOccupied) return current;

           // AI Rotation Logic (Auto-Rotate on Move)
           let newRotation = unit.rotation;
           if (action.target!.y < unit.y) newRotation = Direction.NORTH;
           else if (action.target!.x > unit.x) newRotation = Direction.EAST;
           else if (action.target!.y > unit.y) newRotation = Direction.SOUTH;
           else if (action.target!.x < unit.x) newRotation = Direction.WEST;

           // Deduct cost
           const dist = Math.abs(unit.x - action.target!.x) + Math.abs(unit.y - action.target!.y);

           const newUnits = current.units.map(u => u.id === unit.id ? { 
               ...u, 
               x: action.target!.x, 
               y: action.target!.y, 
               rotation: newRotation,
               movesLeft: Math.max(0, u.movesLeft - dist)
           } : u);
           return { ...current, units: newUnits };
        });
        await new Promise(r => setTimeout(r, 600)); 

      } else if (action.actionType === 'rotate' && action.direction !== undefined) {
         setGameState(current => {
           const unit = current.units.find(u => u.id === action.unitId);
           if (!unit) return current;
           const newUnits = current.units.map(u => u.id === unit.id ? { ...u, rotation: action.direction! } : u);
           return { ...current, units: newUnits };
         });
         await new Promise(r => setTimeout(r, 300));

      } else if (action.actionType === 'attack' && action.target) {
         // Using ref to get current state ensures we don't have stale closures inside the loop
         const current = gameStateRef.current;
         const attacker = current.units.find(u => u.id === action.unitId);
         const defender = getUnitAt(current.units, action.target!.x, action.target!.y);
         
         if (attacker && defender) {
             // 1. Start Animation
             setGameState(prev => ({ 
                 ...prev, 
                 combatState: { attackerIds: [attacker.id], defenderId: defender.id } 
             }));
             
             // 2. Wait for animation
             await new Promise(r => setTimeout(r, 800));

             // 3. Resolve Combat
             setGameState(prev => {
                const atk = prev.units.find(u => u.id === action.unitId);
                const def = getUnitAt(prev.units, action.target!.x, action.target!.y);
                if (!atk || !def) return { ...prev, combatState: null }; 

                const res = resolveCombat([atk], def, prev.computerSupport, prev.playerSupport);
                
                let newUnits = [...prev.units];
                
                if (res.winner === 'attacker') {
                     // Defender Killed
                     newUnits = newUnits.filter(u => u.id !== def.id);
                } else if (res.winner === 'defender') {
                     // Attacker Killed (Melee Rebound)
                     newUnits = newUnits.filter(u => u.id !== atk.id);
                }
                
                // Update attacker stats if still alive
                if (newUnits.some(u => u.id === atk.id)) {
                    newUnits = newUnits.map(u => u.id === atk.id ? { ...u, attacksLeft: 0 } : u);
                }
                
                return { 
                  ...prev, 
                  units: newUnits, 
                  combatState: null,
                  logs: [...prev.logs, res.log]
                };
             });
         }
      }
    }

    // Cleanup Computer Turn
    setGameState(prev => {
       const resetUnits = prev.units.map(u => 
         u.player === 'computer' 
         ? { ...u, movesLeft: u.maxMoves, attacksLeft: 1, hasRotated: false } 
         : u
       );
       
       const playerAlive = resetUnits.some(u => u.player === 'player');
       const compAlive = resetUnits.some(u => u.player === 'computer');
       let winner: Player | null = null;
       let turn: any = 'player';
       let logs = [...prev.logs, "Your Turn."];

       if (!playerAlive) { winner = 'computer'; turn = 'game_over'; logs.push("Computer Wins!"); }
       if (!compAlive) { winner = 'player'; turn = 'game_over'; logs.push("You Win!"); }

       return { ...prev, units: resetUnits, turn, winner, logs, combatState: null };
    });
    setAiPlan(null);
    setIsProcessingAI(false);
  };

  const renderGameControls = () => {
     if (gameState.turn === 'computer') {
         if (aiPlan && !isProcessingAI) {
             return (
                 <button 
                   onClick={runComputerTurn}
                   className="w-full py-4 bg-red-600 hover:bg-red-500 rounded font-bold text-white shadow-xl animate-bounce"
                 >
                   EXECUTE COMPUTER MOVES
                 </button>
             );
         }
         return (
             <div className="p-4 bg-slate-800 rounded-lg border border-red-900 animate-pulse">
                <p className="text-red-400 font-bold text-center">Computer Planning Strategy...</p>
             </div>
         );
     }

     if (gameState.turn !== 'player') return null;
     const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);

     // PENDING ATTACK CONTROLS
     if (gameState.pendingAttack) {
         const attackerCount = gameState.pendingAttack.attackerIds.length;
         return (
             <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg shadow-lg space-y-3 animate-pulse">
                 <h2 className="text-xl font-bold text-red-200">Prepare Attack</h2>
                 <p className="text-sm text-red-100">
                     Target selected. Select more of your units to join the attack.
                 </p>
                 <div className="text-center font-bold text-2xl my-2">
                     {attackerCount} Unit{attackerCount !== 1 ? 's' : ''} Ready
                 </div>
                 <div className="flex gap-2">
                     <button 
                       onClick={confirmPendingAttack}
                       disabled={attackerCount === 0}
                       className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded font-bold text-white shadow-lg disabled:opacity-50"
                     >
                       ATTACK!
                     </button>
                     <button 
                       onClick={cancelPendingAttack}
                       className="flex-1 py-3 bg-slate-600 hover:bg-slate-500 rounded font-bold text-white"
                     >
                       Cancel
                     </button>
                 </div>
             </div>
         );
     }

     return (
       <div className="p-4 bg-slate-800 rounded-lg shadow-lg space-y-3">
         <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-blue-400">Your Turn</h2>
            <div className="flex gap-2">
                <select 
                    value={gameState.difficulty} 
                    onChange={(e) => setGameState(p => ({...p, difficulty: e.target.value as Difficulty}))}
                    className="bg-slate-700 text-xs rounded border border-slate-600 px-1"
                >
                    <option value="random">Rand</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Med</option>
                    <option value="hard">Hard</option>
                </select>
                <button 
                  onClick={endPlayerTurn}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-bold text-sm"
                >
                  End Turn
                </button>
            </div>
         </div>

         <div className="flex items-center justify-between bg-slate-700/50 p-2 rounded">
             <span className="text-xs text-slate-400">Computer Support Lines:</span>
             <button
               onClick={() => setGameState(prev => ({...prev, showComputerSupport: !prev.showComputerSupport}))}
               className={`text-xs px-2 py-1 rounded border ${gameState.showComputerSupport ? 'bg-red-500/20 border-red-500 text-red-300' : 'border-slate-600 text-slate-400'}`}
             >
                 {gameState.showComputerSupport ? 'Hide' : 'Show'}
             </button>
         </div>

         <hr className="border-slate-700"/>

         {selectedUnit ? (
           <div className="space-y-2">
             <div className="flex justify-between items-center text-sm">
                <span className="font-bold text-lg">{selectedUnit.type}</span>
                <span className="text-slate-400">
                    MP: {selectedUnit.movesLeft}/{selectedUnit.maxMoves} | ATK: {selectedUnit.attacksLeft}
                </span>
             </div>
             
             <div className="text-xs bg-slate-700 p-2 rounded">
                 <div className="flex justify-between">
                    <span>Base Strength:</span>
                    <span className="font-bold text-white">1</span>
                 </div>
                 <div className="flex justify-between">
                    <span>Support Bonus:</span>
                    <span className="font-bold text-blue-400">
                        +{calculateBaseStrength(selectedUnit, gameState.playerSupport) - 1}
                    </span>
                 </div>
             </div>

             <div className="flex gap-2 justify-center pt-2">
               <button 
                 onClick={() => executeRotate('left')}
                 disabled={!canRotate(selectedUnit)}
                 className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded shadow"
                 title="Rotate Left"
               >
                 ↺ Turn Left
               </button>
               <button 
                 onClick={() => executeRotate('right')}
                 disabled={!canRotate(selectedUnit)}
                 className="px-3 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 rounded shadow"
                 title="Rotate Right"
               >
                 Turn Right ↻
               </button>
             </div>
             <p className="text-xs text-center text-slate-500 mt-2">
               Click enemies to prepare attack.
             </p>
           </div>
         ) : (
           <p className="text-slate-400 text-sm text-center italic">Select a unit to command.</p>
         )}
       </div>
     );
  };

  const selectedUnit = gameState.units.find(u => u.id === gameState.selectedUnitId);
  // Generate 1-based coordinates
  const validMoves = (selectedUnit && gameState.turn === 'player' && !gameState.pendingAttack) 
    ? Array.from({length: GRID_SIZE*GRID_SIZE}).map((_, i) => ({x: (i%GRID_SIZE)+1, y: Math.floor(i/GRID_SIZE)+1}))
        .filter(c => isValidMove(selectedUnit, c.x, c.y, gameState.units) && selectedUnit.movesLeft > 0)
    : [];
  
  const validTargets = (selectedUnit && gameState.turn === 'player')
    ? getValidAttackTargets(selectedUnit, gameState.units).map(u => ({x: u.x, y: u.y}))
    : [];

  return (
    <div className="flex flex-col lg:flex-row h-screen p-4 gap-4 items-center lg:items-start justify-center overflow-hidden relative">
      
      {/* Rules Modal */}
      {showRules && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-800 rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-700 shadow-2xl">
                <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-900/50 rounded-t-lg">
                    <h2 className="text-xl font-bold text-white">Game Rules (Zasady Gry)</h2>
                    <button 
                        onClick={() => setShowRules(false)}
                        className="text-slate-400 hover:text-white text-2xl font-bold px-2"
                    >
                        &times;
                    </button>
                </div>
                <div className="p-6 overflow-y-auto text-sm text-slate-300 leading-relaxed whitespace-pre-wrap font-mono scrollbar-hide">
                    {RULES_TEXT}
                </div>
                <div className="p-4 border-t border-slate-700 bg-slate-900/50 rounded-b-lg text-right">
                    <button 
                        onClick={() => setShowRules(false)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="flex-shrink-0 flex justify-center w-full lg:w-auto">
        <div className="w-full max-w-[600px] aspect-square">
          <Board 
            units={gameState.units}
            playerSupport={gameState.playerSupport}
            computerSupport={gameState.computerSupport}
            showComputerSupport={gameState.showComputerSupport}
            onTileClick={handleTileClick}
            onSupportToggle={toggleSupport}
            selectedUnitId={gameState.selectedUnitId}
            validMoves={validMoves}
            validTargets={validTargets}
            phase={gameState.turn}
            combatState={gameState.combatState}
            pendingAttack={gameState.pendingAttack}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4 w-full lg:w-96 h-full max-h-[90vh]">
        <div className="bg-slate-800 p-4 rounded-lg shadow border border-slate-700 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
              Skrimish 7x7
            </h1>
            <div className="text-xs text-slate-400 mt-1">
               {gameState.turn === 'game_over' ? `Winner: ${gameState.winner?.toUpperCase()}` : `Current Phase: ${gameState.turn}`}
            </div>
          </div>
          <button 
                onClick={() => setShowRules(true)}
                className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300 border border-slate-600 transition-colors"
            >
                Display Rules
            </button>
        </div>

        {gameState.turn === 'setup_placement' && (
             <div className="p-4 bg-slate-800 rounded-lg shadow-lg">
               <h2 className="text-xl font-bold mb-2 text-blue-400">Deployment</h2>
               <div className="flex gap-2 mb-2 flex-wrap">
                 {setupUnitsLeft.map((u, i) => (
                   <div key={i} className="px-2 py-1 bg-slate-700 rounded text-xs border border-slate-600">
                     {u}
                   </div>
                 ))}
               </div>
               {setupUnitsLeft.length === 0 && <span className="text-green-500">All placed.</span>}
               <p className="text-xs text-slate-500 mt-2">Place in bottom center (2x3 area).</p>
             </div>
        )}
        {gameState.turn === 'setup_support' && (
            <div className="p-4 bg-slate-800 rounded-lg shadow-lg">
               <h2 className="text-xl font-bold mb-2 text-blue-400">Supply Lines</h2>
               <p className="text-xs text-slate-500 mb-4">Select 3 lines ({gameState.playerSupport.length}/3)</p>
               <button 
                 onClick={finishSetup}
                 disabled={gameState.playerSupport.length !== 3}
                 className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 rounded font-bold transition-colors"
               >
                 Start Game
               </button>
            </div>
        )}

        {renderGameControls()}
        
        <div className="flex-1 bg-black/30 rounded-lg p-3 overflow-y-auto font-mono text-xs border border-slate-700 scrollbar-hide">
           {gameState.logs.map((log, i) => (
             <div key={i} className="mb-1 border-b border-slate-800 pb-1 last:border-0 text-slate-300">
               <span className="text-slate-600 mr-2">[{i+1}]</span>
               {log}
             </div>
           ))}
           <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}